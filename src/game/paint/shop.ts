import * as THREE from 'three';
import type { Yard, Load } from '../crane/yard';
import type { EventBus } from '../../core/events';
import { createPaint, coverage, ignite, stepPaint, paintScore, type CorePaint, type PaintBalance } from './paint';

/**
 * Malarnia rdzeni w świecie gry: siwa farba widoczna na formie, płomienie i światło przy wypalaniu,
 * odliczanie schnięcia i punkty, gdy forma jest gotowa.
 */
/** Kolory pomalowanej formy (siwa farba): świeża – jasna, wypalona – stalowa z lekkim błękitem. */
const PAINTED_WET = 0xd3d9de, PAINTED_READY = 0x97a6b4;

interface View { tex: THREE.CanvasTexture; cv: HTMLCanvasElement; mesh: THREE.Mesh; rev: number; fire: THREE.Group | null; light: THREE.PointLight | null; /** bryła masy formy z własnym materiałem (kolor zależny od farby) */ block: THREE.Mesh | null; tint: string }

export class PaintShop {
  private views = new Map<string, View>(); private t = 0;
  constructor(private yard: Yard, private bus: EventBus, private bal: PaintBalance, private low: boolean) {}

  /** Stan farby formy (tworzony przy pierwszym malowaniu). */
  paintOf(l: Load): CorePaint { return (l.paint ??= createPaint()); }

  private view(l: Load): View {
    let v = this.views.get(l.id); if (v) return v;
    const p = this.paintOf(l); const cv = document.createElement('canvas'); cv.width = p.nx * 4; cv.height = p.nz * 4;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter;
    const geo = new THREE.PlaneGeometry(l.def.inner.l, l.def.inner.w); geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.y = l.def.inner.h + .008; mesh.renderOrder = 2; l.tilt.add(mesh);
    // bryła masy: własna kopia materiału, żeby kolor zmieniał tylko tę formę
    const holder = l.tilt.children.find(c => c !== mesh && (c as THREE.Group).isGroup) as THREE.Group | undefined;
    const block = (holder?.children.find(c => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined) ?? null;
    if (block) { block.material = (block.material as THREE.Material).clone(); block.userData.base = (block.material as THREE.MeshToonMaterial).color.clone(); }
    v = { tex, cv, mesh, rev: -1, fire: null, light: null, block, tint: '' }; this.views.set(l.id, v); return v;
  }
  /** Przerysowuje farbę na formie (po malowaniu). */
  private redraw(l: Load, v: View) {
    const p = this.paintOf(l); const c = v.cv.getContext('2d')!; c.clearRect(0, 0, v.cv.width, v.cv.height);
    const dark = p.state === 'ready'; // wypalona farba jest ciemniejsza i matowa
    for (let j = 0; j < p.nz; j++) for (let i = 0; i < p.nx; i++) if (p.grid[j * p.nx + i]) { const n = ((i * 7 + j * 13) % 5) * 5; c.fillStyle = dark ? `rgb(${140 + n},${155 + n},${170 + n})` : `rgb(${196 + n},${203 + n},${209 + n})`; c.fillRect(i * 4 - .5, j * 4 - .5, 5, 5); }
    v.tex.needsUpdate = true; v.rev = p.rev;
  }

  /** Kolor całej formy: niepomalowana – ciemna masa, świeża farba – jasnosiwa, wypalona – siwa (stalowa). */
  private tintBlock(l: Load, v: View) {
    const p = this.paintOf(l); if (!v.block) return;
    const cov = coverage(p); const key = `${p.state}:${Math.round(cov * 20)}`; if (key === v.tint) return; v.tint = key;
    const m = v.block.material as THREE.MeshToonMaterial; const base = v.block.userData.base as THREE.Color;
    const target = new THREE.Color(p.state === 'ready' ? PAINTED_READY : PAINTED_WET);
    m.color.copy(base).lerp(target, p.state === 'ready' ? Math.min(1, cov * 1.1) : Math.min(1, cov * 1.1) * .95);
  }

  /** Podpala świeżo pomalowaną formę. */
  light(l: Load): boolean {
    const p = this.paintOf(l); if (!ignite(p, this.bal)) return false;
    const v = this.view(l); const g = new THREE.Group(); g.position.y = l.def.inner.h + .02;
    const n = this.low ? 7 : 12;
    for (let i = 0; i < n; i++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(.11 + (i % 3) * .04, .4 + (i % 4) * .1, 6), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xff8a1e : 0xffd45a, transparent: true, opacity: .9, depthWrite: false, toneMapped: false }));
      fl.position.set((((i * 37) % 100) / 100 - .5) * l.def.inner.l * .85, .17, (((i * 61) % 100) / 100 - .5) * l.def.inner.w * .85); fl.userData.ph = i * 1.7; fl.renderOrder = 3; g.add(fl);
    }
    l.tilt.add(g); v.fire = g;
    v.light = new THREE.PointLight(0xff8a2a, 14, 9, 1.6); v.light.position.set(0, l.def.inner.h + .7, 0); l.tilt.add(v.light);
    this.bus.emit('toast', { text: `Farba na formie ${l.def.number} płonie – wypali się za ok. ${Math.round(this.bal.burnSec)} s.`, kind: 'info' });
    return true;
  }

  update(dt: number) {
    this.t += dt;
    for (const l of this.yard.loads) {
      const p = l.paint; if (!p) continue; const v = this.view(l);
      if (v.rev !== p.rev) this.redraw(l, v);
      this.tintBlock(l, v);
      if (v.fire) { for (const f of v.fire.children) { const k = .75 + .35 * Math.sin(this.t * 11 + f.userData.ph) + .2 * Math.sin(this.t * 23 + f.userData.ph * 2); f.scale.set(1, Math.max(.3, k) * Math.min(1, p.t / 2 + .25), 1); f.position.y = .17 * f.scale.y; } }
      if (v.light) v.light.intensity = (11 + 5 * Math.sin(this.t * 14) + 3 * Math.sin(this.t * 31)) * Math.min(1, p.t / 2 + .2);
      if (stepPaint(p, dt) === 'ready') {
        if (v.fire) { l.tilt.remove(v.fire); v.fire.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); v.fire = null; }
        if (v.light) { l.tilt.remove(v.light); v.light.dispose(); v.light = null; }
        p.rev++; // wypalona farba ciemnieje
        const cov = coverage(p), pts = paintScore(cov, this.bal);
        if (pts) this.bus.emit('score:add', { delta: pts, reason: `Rdzeń ${l.def.number} pomalowany (${Math.round(cov * 100)}%)` });
        this.bus.emit('toast', { text: cov >= this.bal.minCover ? `Forma ${l.def.number} gotowa – farba wypalona.` : `Forma ${l.def.number} gotowa, ale niedomalowana (${Math.round(cov * 100)}%).`, kind: cov >= this.bal.minCover ? 'ok' : 'bad' });
      }
    }
    // sprzątanie po formach, których już nie ma
    for (const [id, v] of this.views) if (!this.yard.loads.some(l => l.id === id)) { v.tex.dispose(); v.mesh.geometry.dispose(); (v.mesh.material as THREE.Material).dispose(); this.views.delete(id); }
  }
}
