import * as THREE from 'three';
import { Builder, V } from '../render/build';
import { modelById, type ModelDef } from '../../data/models';
import type { ModelSpawn } from '../../data/layout';
import type { LiftHook } from './formLift';

/**
 * Ładunki na hali: modele (skrzynki z wzorem) i formy (zasypana, ubita masa z hakami Ω).
 * Wspólne dla wszystkich suwnic – każda suwnica może podnieść każdy ładunek.
 */
export interface FormInfo { hooks: LiftHook[]; seed: number; points: number }

export interface Load {
  id: string; kind: 'model' | 'form'; name: string; def: ModelDef;
  group: THREE.Group; tilt: THREE.Group;
  x: number; y: number; z: number;
  /** model: wysokość ucha zawiesia; forma: wysokość ucha haków nad spodem */
  lugH: number;
  /** wysokość bryły (do podpierania innych ładunków) */
  height: number;
  half: { x: number; z: number };
  /** model: zasypana forma w środku */
  form: FormInfo | null;
  formMesh: THREE.Group | null;
  /** forma: model, z którego została wyjęta */
  parent?: Load;
  /** czyja suwnica trzyma ładunek */
  heldBy?: string;
  onPallet?: boolean;
}

export const MODEL_BASE = .06;   // grubość płyty modelu
export const WALL_H = .55;       // wysokość ścian modelu
export const HOOK_OUT = .16;     // ile ucho haka wystaje ponad masę

export class Yard {
  loads: Load[] = [];
  group = new THREE.Group();
  private hookGeo: THREE.TubeGeometry;
  private n = 0;

  constructor(private b: Builder) {
    const c = new THREE.CatmullRomCurve3([V(-.04, 0, 0), V(-.04, .2, 0), V(-.065, .26, 0), V(-.045, .31, 0), V(0, .33, 0), V(.045, .31, 0), V(.065, .26, 0), V(.04, .2, 0), V(.04, 0, 0)]);
    this.hookGeo = new THREE.TubeGeometry(c, 30, .011, 6);
  }

  addModel(m: ModelSpawn): Load {
    const def = modelById(m.modelId)!; const b = this.b;
    const group = new THREE.Group(); const tilt = new THREE.Group(); group.add(tilt);
    const { l, w } = def.inner, t = .06, L = l + 2 * t, W = w + 2 * t;
    tilt.add(b.box(L + .08, MODEL_BASE, W + .08, 'green', [0, MODEL_BASE / 2, 0]));
    tilt.add(b.box(L, WALL_H, t, 'green', [0, MODEL_BASE + WALL_H / 2, w / 2 + t / 2]), b.box(L, WALL_H, t, 'green', [0, MODEL_BASE + WALL_H / 2, -w / 2 - t / 2]));
    tilt.add(b.box(t, WALL_H, w, 'green', [l / 2 + t / 2, MODEL_BASE + WALL_H / 2, 0]), b.box(t, WALL_H, w, 'green', [-l / 2 - t / 2, MODEL_BASE + WALL_H / 2, 0]));
    // uchwyty modelu (czopy po bokach) i zawiesie do wspólnego ucha
    for (const s of [-1, 1]) tilt.add(b.cyl(.05, .05, .16, 'steel', [s * (L / 2 + .07), .45, 0], [0, 0, Math.PI / 2], 10));
    for (const p of def.pattern) {
      if (p.kind === 'halfCyl') { const mm = b.mesh(new THREE.CylinderGeometry(p.r, p.r, p.len, 20, 1, false, 0, Math.PI), p.color, [p.x, MODEL_BASE, p.z]); if (p.axis === 'x') mm.rotation.z = Math.PI / 2; else { mm.rotation.x = Math.PI / 2; mm.rotation.z = Math.PI / 2; } tilt.add(mm); }
      else if (p.kind === 'cyl') tilt.add(b.cyl(p.r, p.r, p.h, p.color, [p.x, MODEL_BASE + p.h / 2, p.z], undefined, 16));
      else tilt.add(b.box(p.w, p.h, p.d, p.color, [p.x, MODEL_BASE + p.h / 2, p.z]));
    }
    const lugH = .98;
    for (const s of [-1, 1]) tilt.add(b.limb(V(s * (L / 2 + .12), .45, 0), V(0, lugH - .04, 0), .01, 'dark', 5));
    tilt.add(b.mesh(new THREE.TorusGeometry(.06, .016, 6, 14), 'steel', [0, lugH, 0]));
    group.position.set(m.x, .14, m.z); this.group.add(group);
    const load: Load = { id: m.id, kind: 'model', name: m.name, def, group, tilt, x: m.x, y: .14, z: m.z, lugH, height: MODEL_BASE + WALL_H, half: { x: L / 2 + .04, z: W / 2 + .04 }, form: null, formMesh: null };
    this.loads.push(load); return load;
  }

  /** Bryła formy: ubita masa + wystające ucha haków. Spód formy w y = 0. */
  private formBlock(def: ModelDef, info: FormInfo): THREE.Group {
    const g = new THREE.Group(); const { l, w, h } = def.inner;
    const block = this.b.box(l - .004, h, w - .004, 'sand', [0, h / 2, 0]); g.add(block);
    for (const hk of info.hooks) {
      const m = new THREE.Mesh(this.hookGeo, this.b.mats.get('steel')); m.castShadow = true;
      m.position.set(hk.x, h + HOOK_OUT - .33, hk.z); m.rotation.y = Math.PI / 2; g.add(m);
    }
    return g;
  }

  /** Po sypaniu: w modelu widać zasypaną formę z hakami. */
  fillModel(model: Load, info: FormInfo) {
    if (model.formMesh) model.tilt.remove(model.formMesh);
    model.form = info; model.formMesh = this.formBlock(model.def, info); model.formMesh.position.y = MODEL_BASE; model.tilt.add(model.formMesh);
  }

  /** Wyjęcie formy z modelu – forma staje się osobnym ładunkiem. */
  extractForm(model: Load): Load {
    const info = model.form!; const def = model.def;
    if (model.formMesh) { model.tilt.remove(model.formMesh); model.formMesh = null; }
    model.form = null;
    const group = new THREE.Group(); const tilt = new THREE.Group(); group.add(tilt);
    tilt.add(this.formBlock(def, info));
    group.position.set(model.x, model.y + MODEL_BASE, model.z); this.group.add(group);
    const f: Load = { id: `forma-${++this.n}-${model.id}`, kind: 'form', name: `Forma ${def.number}`, def, group, tilt, x: model.x, y: model.y + MODEL_BASE, z: model.z, lugH: def.inner.h + HOOK_OUT, height: def.inner.h, half: { x: def.inner.l / 2, z: def.inner.w / 2 }, form: info, formMesh: null, parent: model };
    this.loads.push(f); return f;
  }

  remove(l: Load) { this.group.remove(l.group); this.loads = this.loads.filter(x => x !== l); l.group.traverse(o => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry !== this.hookGeo) (o as THREE.Mesh).geometry.dispose(); }); }

  /** Pęknięta forma rozsypuje się w bryłki, które po chwili znikają. */
  crumble(f: Load, done?: () => void) {
    const g = new THREE.Group(); g.position.copy(f.group.position); this.group.add(g);
    const { l, w, h } = f.def.inner; const bits: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = [];
    for (let i = 0; i < 26; i++) {
      const s = .08 + Math.random() * .16; const m = this.b.box(s, s * .8, s, 'sand', [(Math.random() - .5) * l, Math.random() * h, (Math.random() - .5) * w]);
      g.add(m); bits.push({ m, v: V((Math.random() - .5) * .8, Math.random() * .6, (Math.random() - .5) * .8), r: V(Math.random() * 4, Math.random() * 4, Math.random() * 4) });
    }
    this.remove(f);
    let t = 0; const step = () => {
      t += 1 / 60;
      for (const bt of bits) { bt.v.y -= 9.81 / 60; bt.m.position.addScaledVector(bt.v, 1 / 60); if (bt.m.position.y < .05) { bt.m.position.y = .05; bt.v.multiplyScalar(.3); } bt.m.rotation.x += bt.r.x / 60; bt.m.rotation.z += bt.r.z / 60; }
      if (t > 1.6) g.scale.multiplyScalar(.93);
      if (t < 2.4) requestAnimationFrame(step); else { this.group.remove(g); g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); done?.(); }
    };
    requestAnimationFrame(step);
  }

  /** Punkty zaczepu haków formy w świecie (model z formą albo wyjęta forma). */
  formHookPoints(l: Load): THREE.Vector3[] {
    const info = l.form; if (!info) return [];
    const base = l.kind === 'model' ? l.y + MODEL_BASE : l.y; const top = base + l.def.inner.h + HOOK_OUT;
    const out: THREE.Vector3[] = [];
    for (const hk of info.hooks) { const p = V(hk.x, top - base, hk.z).applyEuler(l.tilt.rotation); out.push(V(l.x + p.x, base + p.y, l.z + p.z)); }
    return out;
  }
}
