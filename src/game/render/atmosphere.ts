import * as THREE from 'three';
import { Builder } from './build';
import { STATIONS, LADLE } from '../../data/layout';

/**
 * Nastrój hali: lampy nad stanowiskami, żar z kadzi z ciekłym aluminium (migocze, sypie iskrami)
 * i ziarnista „papierowa” nakładka z winietą. To daje grze własny, rysunkowy charakter.
 */
export class Atmosphere {
  group = new THREE.Group();
  private glow: THREE.PointLight; private lamps: THREE.PointLight[] = [];
  private sparks: THREE.Points; private vel: Float32Array; private life: Float32Array;
  private t = 0;

  constructor(b: Builder, low: boolean) {
    for (const st of STATIONS) { const l = new THREE.PointLight(0xffc27a, low ? 22 : 26, 13, 1.5); l.position.set(st.x - .5, 6, st.z + 1.2); this.group.add(l); this.lamps.push(l); }
    // kadź
    const { x, z } = LADLE; const g = new THREE.Group(); g.position.set(x, 0, z); this.group.add(g);
    g.add(b.cyl(.72, .6, .95, 'dark', [0, .5, 0], undefined, 20), b.cyl(.78, .78, .1, 'steel', [0, .98, 0], undefined, 20));
    const molten = b.cyl(.62, .62, .04, 'molten', [0, 1.02, 0], undefined, 20); molten.castShadow = false; g.add(molten);
    const core = b.cyl(.34, .34, .04, 'moltenCore', [.08, 1.03, -.05], undefined, 16); core.castShadow = false; g.add(core);
    for (const s of [-1, 1]) g.add(b.box(.14, .5, .14, 'steel', [s * .82, .6, 0]));
    g.add(b.box(1.9, .1, .12, 'yellow', [0, .22, .75]), b.box(1.9, .1, .12, 'yellow', [0, .22, -.75]));
    this.glow = new THREE.PointLight(0xff7a22, 30, 15, 1.5); this.glow.position.set(x, 1.6, z); this.group.add(this.glow);
    // iskry
    const n = low ? 24 : 48; const pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffd27a, size: 4, sizeAttenuation: false, transparent: true, opacity: .95, depthWrite: false }));
    this.sparks.frustumCulled = false; (this.sparks.material as THREE.Material).userData.outlineParameters = { visible: false }; this.group.add(this.sparks);
  }

  update(dt: number) {
    this.t += dt; const t = this.t;
    // żar „oddycha” i migocze
    this.glow.intensity = 28 + Math.sin(t * 2.1) * 4 + Math.sin(t * 13.7) * 2.5 + Math.sin(t * 31) * 1.5;
    this.lamps.forEach((l, i) => { l.intensity = (l.userData.base ??= l.intensity) * (1 + Math.sin(t * 1.3 + i * 2) * .04); });
    const p = this.sparks.geometry.attributes.position as THREE.BufferAttribute; const a = p.array as Float32Array;
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const an = Math.random() * Math.PI * 2, r = Math.random() * .5;
        a[i * 3] = LADLE.x + Math.cos(an) * r; a[i * 3 + 1] = 1.05; a[i * 3 + 2] = LADLE.z + Math.sin(an) * r;
        const sp = .6 + Math.random() * 1.6; this.vel[i * 3] = Math.cos(an) * sp; this.vel[i * 3 + 1] = 1.2 + Math.random() * 2.2; this.vel[i * 3 + 2] = Math.sin(an) * sp;
        this.life[i] = .5 + Math.random() * 1.1;
      } else {
        this.vel[i * 3 + 1] -= 6 * dt;
        a[i * 3] += this.vel[i * 3] * dt; a[i * 3 + 1] = Math.max(.03, a[i * 3 + 1] + this.vel[i * 3 + 1] * dt); a[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      }
    }
    p.needsUpdate = true;
  }
}

/** Ziarno papieru + winieta jako nakładka na obraz gry. */
export function paperOverlay(): HTMLElement {
  const c = document.createElement('canvas'); c.width = c.height = 192; const x = c.getContext('2d')!; const im = x.createImageData(192, 192);
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < im.data.length; i += 4) { const v = 222 + rnd() * 33 - (rnd() < .03 ? 30 : 0); im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v - 4; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0);
  const el = document.createElement('div'); el.className = 'paper';
  el.style.backgroundImage = `radial-gradient(ellipse at 50% 46%, rgba(255,255,255,0) 55%, rgba(60,44,84,.6) 100%), url(${c.toDataURL()})`;
  return el;
}
