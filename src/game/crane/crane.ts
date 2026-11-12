import * as THREE from 'three';
import { Builder, V, setSeg } from '../render/build';
import { createCrane, stepCrane, hookPosition, canAttach, swingAmplitude, type CraneState, type CraneInput } from './craneSim';
import type { Balance } from '../../core/balance';
import type { EventBus } from '../../core/events';
import { STATIONS, type ModelSpawn } from '../../data/layout';

/** Model na suwnicy – bryła + dane do fizyki. */
interface LoadObj { id: string; name: string; group: THREE.Group; tilt: THREE.Group; x: number; y: number; z: number; lugH: number }

/** Suwnica: grafika + połączenie z fizyką (craneSim) i ładunkami. */
export class Crane {
  state: CraneState;
  group = new THREE.Group();
  private bridge = new THREE.Group();
  private trolley = new THREE.Group();
  private hook = new THREE.Group();
  private ropes: THREE.Mesh[];
  private sling: THREE.Mesh[];
  private pendantCable: THREE.Mesh;
  private pendant: THREE.Mesh;
  loads: LoadObj[] = [];
  attached: LoadObj | null = null;

  constructor(private b: Builder, private bus: EventBus, private support: (x: number, z: number) => number, start: { x: number; z: number }, models: ModelSpawn[]) {
    this.state = createCrane(start.x, start.z, { ropeTop: 3.05, hookY: 2.2, limits: { x: [1.5, 34.5], z: [1.2, 20.8], y: [0.3, 2.65] } });
    const g = this.group; g.add(this.bridge, this.hook);
    // most (dwa dźwigary wzdłuż osi z) + wózek
    this.bridge.add(b.box(.18, .32, 21.6, 'yellow', [-.38, 3.25, 11]), b.box(.18, .32, 21.6, 'yellow', [.38, 3.25, 11]));
    this.bridge.add(b.box(1.3, .3, .5, 'yellow', [0, 3.15, .3]), b.box(1.3, .3, .5, 'yellow', [0, 3.15, 21.7]));
    this.bridge.add(this.trolley);
    this.trolley.add(b.box(1.2, .35, 1.0, 'yellow', [0, 3.55, 0]), b.cyl(.22, .22, .9, 'dark', [0, 3.4, 0], [0, 0, Math.PI / 2], 12), b.box(.25, .15, .25, 'redBtn', [.45, 3.78, .35]));
    // hak
    this.hook.add(b.box(.3, .34, .16, 'yellow', [0, .3, 0]), b.mesh(new THREE.TorusGeometry(.07, .022, 8, 18, Math.PI * 1.5), 'steel', [0, .05, 0], [0, 0, Math.PI * .25]));
    this.ropes = [b.seg('steel', .012), b.seg('steel', .012)]; this.ropes.forEach(r => g.add(r));
    this.sling = [b.seg('dark', .014), b.seg('dark', .014)]; this.sling.forEach(r => g.add(r));
    this.pendantCable = b.seg('rubber', .01); g.add(this.pendantCable);
    this.pendant = b.box(.1, .26, .08, 'yellow', [0, 0, 0]); g.add(this.pendant);
    for (const m of models) this.addLoad(m);
    this.sync();
  }

  private addLoad(m: ModelSpawn) {
    const b = this.b; const group = new THREE.Group(); const tilt = new THREE.Group(); group.add(tilt);
    // model: płyta + ściany + odsłonięty model odlewu w środku
    tilt.add(b.box(1.68, .06, 1.28, 'green', [0, .03, 0]));
    tilt.add(b.box(1.6, .55, .06, 'green', [0, .335, .57]), b.box(1.6, .55, .06, 'green', [0, .335, -.57]), b.box(.06, .55, 1.08, 'green', [.77, .335, 0]), b.box(.06, .55, 1.08, 'green', [-.77, .335, 0]));
    const half = (r: number, len: number, mat: string, x: number) => { const mm = b.mesh(new THREE.CylinderGeometry(r, r, len, 20, 1, false, 0, Math.PI), mat, [x, .06, 0]); mm.rotation.z = Math.PI / 2; return mm; };
    tilt.add(half(.2, .78, 'red', 0), half(.11, .3, 'core', .54), half(.11, .3, 'core', -.54));
    // zawiesie: 4 linki z narożników do ucha nad środkiem
    const lugH = .95;
    for (const [x, z] of [[-.7, -.5], [.7, -.5], [-.7, .5], [.7, .5]]) tilt.add(b.limb(V(x, .62, z), V(0, lugH - .04, 0), .009, 'dark', 5));
    tilt.add(b.mesh(new THREE.TorusGeometry(.055, .015, 6, 14), 'steel', [0, lugH, 0]));
    group.position.set(m.x, .14, m.z);
    this.group.add(group);
    this.loads.push({ id: m.id, name: m.name, group, tilt, x: m.x, y: .14, z: m.z, lugH });
  }

  /** Miejsce, w którym stoi operator z kasetą sterowniczą. */
  pendantPos(): THREE.Vector3 { return V(this.state.x + .9, 0, this.state.z + .75); }

  /** Najbliższy ładunek, który można zaczepić (albo null). */
  attachable(): LoadObj | null {
    if (this.attached) return null;
    for (const l of this.loads) if (canAttach(this.state, { x: l.x, y: l.y + l.lugH, z: l.z })) return l;
    return null;
  }

  toggleAttach(): void {
    const s = this.state;
    if (this.attached) {
      if (!s.load?.resting) { this.bus.emit('toast', { text: 'Najpierw odstaw ładunek na podłoże', kind: 'bad' }); return; }
      const l = this.attached; const onTarget = this.onTarget(l);
      this.attached = null; s.load = null;
      this.bus.emit('crane:detached', { loadId: l.id, onTarget });
      this.bus.emit('toast', onTarget ? { text: `${l.name} podstawiony pod mieszarkę`, kind: 'ok' } : { text: `${l.name} odczepiony` });
      return;
    }
    const l = this.attachable();
    if (!l) { this.bus.emit('toast', { text: 'Opuść hak tuż nad ucho zawiesia modelu', kind: 'info' }); return; }
    this.attached = l;
    const hp = hookPosition(s);
    s.load = { id: l.id, hang: Math.max(.2, hp.y - l.y), resting: true, x: l.x, y: l.y, z: l.z };
    this.bus.emit('crane:attached', { loadId: l.id });
    this.bus.emit('toast', { text: `${l.name} zaczepiony – podnoś powoli`, kind: 'ok' });
  }

  /** Model odstawiony na rolotoku danego stanowiska (i odczepiony od haka) albo null. */
  loadAtStation(stationId: string): LoadObj | null {
    const st = STATIONS.find(s => s.id === stationId); if (!st) return null;
    return this.loads.find(l => l !== this.attached && Math.abs(l.x - st.x) < .35 && Math.abs(l.z - st.z) < .25 && Math.abs(l.y - .5) < .02) ?? null;
  }

  private onTarget(l: LoadObj): boolean {
    return STATIONS.some(st => Math.abs(l.x - st.x) < .35 && Math.abs(l.z - st.z) < .25 && Math.abs(l.y - .5) < .02);
  }

  setGear(g: 1 | 2) { this.state.gear = g; this.bus.emit('crane:gear', { gear: g }); }

  update(dt: number, input: CraneInput) {
    const s = this.state;
    const sup = (x: number, z: number) => {
      let h = this.support(x, z);
      // inne modele też są podłożem
      for (const l of this.loads) if (l !== this.attached && Math.abs(x - l.x) < .8 && Math.abs(z - l.z) < .62) h = Math.max(h, l.y + .62);
      return h;
    };
    const px = s.x, pz = s.z;
    stepCrane(s, input, dt, this.balance, sup);
    // zaczepiony, ale stojący model: nie da się odjechać wózkiem (lina by go ciągnęła po podłodze)
    if (this.attached && s.load?.resting && Math.hypot(s.x - this.attached.x, s.z - this.attached.z) > .3) {
      s.x = px; s.z = pz; s.vx = 0; s.vz = 0;
      this.bus.emit('toast', { text: 'Najpierw podnieś model (R), potem jedź', kind: 'info' });
    }
    if (this.attached && s.load) { this.attached.x = s.load.x; this.attached.y = s.load.y; this.attached.z = s.load.z; }
    this.sync();
    this.bus.emit('crane:swing', { amplitude: swingAmplitude(s) });
  }
  balance!: Balance['crane'];

  private sync() {
    const s = this.state; const hp = hookPosition(s);
    this.bridge.position.x = s.x; this.trolley.position.z = s.z;
    this.hook.position.set(hp.x, hp.y, hp.z);
    this.hook.rotation.set(s.thZ, 0, -s.thX);
    setSeg(this.ropes[0], V(s.x - .08, 3.3, s.z), V(hp.x - .08, hp.y + .45, hp.z));
    setSeg(this.ropes[1], V(s.x + .08, 3.3, s.z), V(hp.x + .08, hp.y + .45, hp.z));
    const pp = this.pendantPos(); const pt = V(pp.x - .25, 1.15, pp.z - .2);
    setSeg(this.pendantCable, V(s.x + .5, 3.3, s.z + .3), pt); this.pendant.position.copy(pt);
    for (const l of this.loads) {
      l.group.position.set(l.x, l.y, l.z);
      if (l === this.attached && s.load && !s.load.resting) l.tilt.rotation.set(s.thZ * .9, 0, -s.thX * .9);
      else l.tilt.rotation.set(0, 0, 0);
    }
    // zawiesie z haka do ucha, gdy zaczepiony
    if (this.attached) { const lug = V(this.attached.x, this.attached.y + this.attached.lugH, this.attached.z); setSeg(this.sling[0], V(hp.x, hp.y + .05, hp.z), lug); this.sling[1].visible = false; }
    else { setSeg(this.sling[0], V(hp.x, hp.y + .05, hp.z), V(hp.x - .05, hp.y - .35, hp.z)); setSeg(this.sling[1], V(hp.x, hp.y + .05, hp.z), V(hp.x + .05, hp.y - .35, hp.z + .03)); }
  }

  hookWorld(): THREE.Vector3 { const h = hookPosition(this.state); return V(h.x, h.y, h.z); }
}
