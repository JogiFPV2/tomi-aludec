import * as THREE from 'three';
import { Builder, V, setSeg } from '../render/build';
import { createCrane, stepCrane, hookPosition, canAttach, swingAmplitude, type CraneState, type CraneInput } from './craneSim';
import { createLift, stepLift, tiltOf, imbalanceOf, extractScore, type LiftState } from './formLift';
import { Yard, MODEL_BASE, WALL_H, type Load } from './yard';
import type { Balance } from '../../core/balance';
import type { EventBus } from '../../core/events';
import { STATIONS, SLOT_X, REMOTE_OFF, CRANE_START_Z, type Station } from '../../data/layout';

export type AttachKind = 'model' | 'form';
export interface AttachOption { kind: AttachKind; load: Load; label: string }
export interface CraneControl extends CraneInput { chain: -1 | 0 | 1 }

/**
 * Suwnica jednego stanowiska: grafika + fizyka (craneSim) + zaczepianie ładunków.
 * Sterowana pilotem radiowym w kolorze suwnicy – z dowolnego miejsca na hali.
 */
export class Crane {
  state: CraneState;
  group = new THREE.Group();
  private bridge = new THREE.Group();
  private trolley = new THREE.Group();
  private hook = new THREE.Group();
  private ropes: THREE.Mesh[];
  private sling: THREE.Mesh;
  private chains: THREE.Mesh[] = [];
  /** pilot na stojaku przy stanowisku (znika, gdy ktoś go weźmie) */
  remoteOnStand: THREE.Group;
  readonly standPos: THREE.Vector3;
  remoteTaken = false;
  attached: Load | null = null;
  attachKind: AttachKind | null = null;
  lift: LiftState | null = null;
  pending: AttachOption[] | null = null;
  readonly colorMat: THREE.Material;

  constructor(b: Builder, private bus: EventBus, private yard: Yard, private support: (x: number, z: number) => number, readonly station: Station, private bal: Balance) {
    const st = station;
    this.state = createCrane(st.x, CRANE_START_Z, { ropeTop: 3.05, hookY: 2.2, limits: { x: [st.bay[0] + .6, st.bay[1] - .6], z: [1.2, 20.8], y: [0.3, 2.65] } });
    this.colorMat = b.mats.color(st.color, 'crane-' + st.id);
    const g = this.group; g.add(this.bridge, this.hook);
    // most (dwa dźwigary wzdłuż osi z) z obramówką w kolorze suwnicy
    for (const s of [-1, 1]) {
      this.bridge.add(b.box(.2, .34, 21.6, 'yellow', [s * .38, 3.25, 11]));
      // delikatna obramówka: cienki pasek po zewnętrznej krawędzi dźwigara
      this.bridge.add(b.box(.035, .06, 21.6, this.colorMat, [s * .49, 3.4, 11]), b.box(.04, .025, 21.6, this.colorMat, [s * .465, 3.43, 11]));
    }
    for (const z of [.3, 21.7]) this.bridge.add(b.box(1.36, .32, .52, 'yellow', [0, 3.15, z]), b.box(1.4, .06, .56, this.colorMat, [0, 3.33, z]));
    this.bridge.add(this.trolley);
    this.trolley.add(b.box(1.2, .36, 1.0, 'yellow', [0, 3.55, 0]), b.cyl(.22, .22, .9, 'dark', [0, 3.4, 0], [0, 0, Math.PI / 2], 12));
    this.trolley.add(b.box(1.26, .06, 1.06, this.colorMat, [0, 3.76, 0]), b.box(.5, .3, .04, this.colorMat, [0, 3.62, .52]));
    // hak w kolorze suwnicy
    this.hook.add(b.box(.32, .34, .18, this.colorMat, [0, .3, 0]), b.mesh(new THREE.TorusGeometry(.07, .022, 8, 18, Math.PI * 1.5), 'steel', [0, .05, 0], [0, 0, Math.PI * .25]));
    this.ropes = [b.seg('steel', .012), b.seg('steel', .012)]; this.ropes.forEach(r => g.add(r));
    this.sling = b.seg('dark', .014); g.add(this.sling);
    for (let i = 0; i < 4; i++) { const c = b.seg('dark', .012); c.visible = false; this.chains.push(c); g.add(c); }
    // stojak z pilotem
    this.standPos = V(st.x + REMOTE_OFF.x, 0, st.z + REMOTE_OFF.z);
    const stand = new THREE.Group(); stand.position.copy(this.standPos); g.add(stand);
    stand.add(b.box(.12, 1.0, .12, 'dark', [0, .5, 0]), b.box(.34, .05, .26, this.colorMat, [0, 1.02, 0]));
    this.remoteOnStand = Crane.remoteMesh(b, this.colorMat); this.remoteOnStand.position.set(0, 1.1, 0); this.remoteOnStand.rotation.x = -Math.PI / 2.4; stand.add(this.remoteOnStand);
    this.sync();
  }

  /** Pilot suwnicy: żółta obudowa z obramówką w kolorze suwnicy. */
  static remoteMesh(b: Builder, frame: THREE.Material): THREE.Group {
    const r = new THREE.Group();
    r.add(b.box(.11, .2, .05, frame, [0, 0, 0]), b.box(.088, .18, .056, 'yellow', [0, 0, 0]));
    r.add(b.box(.03, .03, .01, 'redBtn', [0, .06, .03]), b.box(.05, .05, .01, 'dark', [0, -.02, .03]), b.cyl(.004, .004, .1, 'dark', [.035, .14, 0], undefined, 5));
    return r;
  }

  get name() { return `Suwnica ${this.station.colorName}`; }

  // ===== zaczepianie =====
  options(): AttachOption[] {
    if (this.attached) return [];
    const s = this.state; const out: AttachOption[] = [];
    for (const l of this.yard.loads) {
      if (l.heldBy && l.heldBy !== this.station.id) continue;
      if (l.kind === 'model' && canAttach(s, { x: l.x, y: l.y + l.lugH, z: l.z })) out.push({ kind: 'model', load: l, label: `Uchwyty modelu ${l.def.number}` });
      if (l.form) {
        const pts = this.yard.formHookPoints(l);
        if (pts.length) { const c = pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / pts.length); if (canAttach(s, c)) out.push({ kind: 'form', load: l, label: `Haki formy (${pts.length})` }); }
        else if (l.kind === 'model' && canAttach(s, { x: l.x, y: l.y + MODEL_BASE + l.def.inner.h + .1, z: l.z })) out.push({ kind: 'form', load: l, label: 'Haki formy (brak haków!)' });
      }
    }
    return out;
  }

  toggleAttach(): void {
    if (this.attached) { this.detach(); return; }
    const o = this.options();
    if (!o.length) { this.bus.emit('toast', { text: 'Opuść hak nad ucho zawiesia modelu albo nad haki formy', kind: 'info' }); return; }
    if (o.length === 1) { this.attach(o[0]); return; }
    this.pending = o; this.bus.emit('crane:choice', { options: o.map(x => x.label) });
  }

  pick(i: number) { const o = this.pending?.[i]; this.pending = null; this.bus.emit('crane:choice', null); if (o) this.attach(o); }

  private attach(o: AttachOption) {
    const s = this.state; const hp = hookPosition(s);
    if (o.kind === 'model') {
      const l = o.load; this.attached = l; this.attachKind = 'model'; l.heldBy = this.station.id;
      s.load = { id: l.id, hang: Math.max(.2, hp.y - l.y), resting: true, x: l.x, y: l.y, z: l.z };
      this.bus.emit('crane:attached', { loadId: l.id });
      this.bus.emit('toast', { text: `${l.name} zaczepiony za uchwyty – podnoś powoli`, kind: 'ok' });
      return;
    }
    let f = o.load;
    if (f.kind === 'model') {
      const model = f; const info = model.form!;
      if (!info.hooks.length) {
        // forma bez haków: nie da się jej wyciągnąć – trzeba ją wybić
        this.bus.emit('toast', { text: 'Forma bez haków – nie da się jej wyciągnąć. Rozbijasz ją (kara).', kind: 'bad' });
        const ff = this.yard.extractForm(model); this.yard.crumble(ff);
        this.bus.emit('score:add', { delta: -this.bal.lift.crackPenalty, reason: 'Forma bez haków – rozbita' });
        return;
      }
      f = this.yard.extractForm(model);
      const imb = imbalanceOf(model.def.hooks, info.hooks, this.bal.lift, info.seed);
      this.lift = createLift(info.hooks.map(h => ({ ...h })), imb, WALL_H + .02);
      this.bus.emit('toast', { text: 'Wyciągaj formę powoli (bieg 1) i trzymaj poziom – koryguj łańcuchami.', kind: 'info' });
    } else this.lift = null;
    this.attached = f; this.attachKind = 'form'; f.heldBy = this.station.id;
    s.load = { id: f.id, hang: Math.max(.2, hp.y - f.y), resting: true, x: f.x, y: f.y, z: f.z };
    this.bus.emit('crane:attached', { loadId: f.id });
  }

  private detach() {
    const s = this.state; const l = this.attached!;
    if (!s.load?.resting) { this.bus.emit('toast', { text: 'Najpierw odstaw ładunek na podłoże', kind: 'bad' }); return; }
    this.attached = null; this.attachKind = null; s.load = null; l.heldBy = undefined;
    for (const c of this.chains) c.visible = false;
    if (l.kind === 'model') {
      const slot = this.slotAt(l);
      this.bus.emit('crane:detached', { loadId: l.id, onTarget: !!slot });
      this.bus.emit('toast', slot ? { text: `${l.name} na rolotoku (${slot.station.name}, miejsce ${slot.slot + 1})`, kind: 'ok' } : { text: `${l.name} odczepiony` });
      return;
    }
    const lift = this.lift; this.lift = null;
    if (lift?.inModel && l.parent) {
      // forma opuszczona z powrotem do modelu
      this.yard.fillModel(l.parent, l.form!); this.yard.remove(l);
      this.bus.emit('toast', { text: 'Forma wróciła do modelu' }); return;
    }
    l.parent = undefined;
    const pt = this.yard.palletTopAt(l.x, l.z);
    if (pt !== null && Math.abs(l.y - pt) < .03) {
      if (!l.onPallet) { l.onPallet = true; this.bus.emit('score:add', { delta: this.bal.lift.palletPoints, reason: `Forma ${l.def.number} na palecie` }); }
      this.bus.emit('toast', { text: `Forma ${l.def.number} odłożona na paletę`, kind: 'ok' });
    } else if (l.y < .03) {
      this.bus.emit('score:add', { delta: -this.bal.lift.floorPenalty, reason: 'Forma odstawiona na posadzkę' });
      this.bus.emit('toast', { text: 'Forma na posadzce – odłóż ją na paletę!', kind: 'bad' });
    } else this.bus.emit('toast', { text: 'Forma odstawiona' });
  }

  /** Miejsce na rolotoku, na którym stoi model (albo null). */
  slotAt(l: Load): { station: Station; slot: number } | null {
    for (const st of STATIONS) for (let i = 0; i < SLOT_X.length; i++)
      if (Math.abs(l.x - (st.x + SLOT_X[i])) < .35 && Math.abs(l.z - st.z) < .25 && Math.abs(l.y - .5) < .02) return { station: st, slot: i };
    return null;
  }

  selectChain(i: number) { if (this.lift && i < this.lift.hooks.length) this.lift.sel = i; }

  setGear(g: 1 | 2) { this.state.gear = g; this.bus.emit('crane:gear', { gear: g }); }

  update(dt: number, input: CraneControl | null) {
    const s = this.state; const att = this.attached; const lift = this.lift;
    let inp: CraneInput = input ?? { mx: 0, mz: 0, hoist: 0 };
    // forma w modelu: tylko pionowo
    if (att && lift?.inModel && (inp.mx || inp.mz)) { inp = { ...inp, mx: 0, mz: 0 }; this.bus.emit('toast', { text: 'Najpierw wyciągnij formę pionowo z modelu', kind: 'info' }); }
    const sup = (x: number, z: number) => {
      if (att && lift?.inModel && att.parent) return att.parent.y + MODEL_BASE;
      let h = this.support(x, z);
      for (const l of this.yard.loads) if (l !== att && Math.abs(x - l.x) < l.half.x && Math.abs(z - l.z) < l.half.z) h = Math.max(h, l.y + l.height);
      return h;
    };
    const px = s.x, pz = s.z; const y0 = s.load?.y ?? 0;
    stepCrane(s, inp, dt, this.bal.crane, sup);
    if (att && att.kind === 'model' && s.load?.resting && Math.hypot(s.x - att.x, s.z - att.z) > .3) {
      s.x = px; s.z = pz; s.vx = 0; s.vz = 0;
      this.bus.emit('toast', { text: 'Najpierw podnieś ładunek, potem jedź', kind: 'info' });
    }
    if (att && s.load) { att.x = s.load.x; att.y = s.load.y; att.z = s.load.z; }
    if (att && lift) {
      const dLift = s.load && !s.load.resting ? Math.max(0, s.load.y - y0) : 0;
      const ev = stepLift(lift, dt, { dLift, adjust: input?.chain ?? 0, swing: { x: s.thX, z: s.thZ } }, this.bal.lift);
      if (ev === 'cracked') this.crack();
      else if (ev === 'out') {
        const pts = extractScore(lift, this.bal.lift);
        this.bus.emit('score:add', { delta: pts, reason: `Wyjęcie formy ${att.def.number}` });
        this.bus.emit('toast', { text: `Forma wyjęta z modelu (maks. przechył ${lift.maxTilt.toFixed(1).replace('.', ',')}°). Odłóż ją na paletę.`, kind: pts > 0 ? 'ok' : 'bad' });
      }
    }
    this.sync();
  }

  private crack() {
    const f = this.attached!; this.attached = null; this.attachKind = null; this.lift = null; this.state.load = null; f.heldBy = undefined;
    for (const c of this.chains) c.visible = false;
    this.yard.crumble(f);
    this.bus.emit('score:add', { delta: -this.bal.lift.crackPenalty, reason: 'Forma pękła przy wyciąganiu' });
    this.bus.emit('toast', { text: 'Forma pękła – za duży przechył! Model jest pusty, trzeba go zasypać od nowa.', kind: 'bad' });
  }

  /** Przechył formy (stopnie) do wskaźnika w panelu. */
  tilt() { return this.lift ? tiltOf(this.lift, { x: this.state.thX, z: this.state.thZ }, this.bal.lift) : null; }
  swing() { return swingAmplitude(this.state); }

  private sync() {
    const s = this.state; const hp = hookPosition(s);
    this.bridge.position.x = s.x; this.trolley.position.z = s.z;
    this.hook.position.set(hp.x, hp.y, hp.z);
    this.hook.rotation.set(s.thZ, 0, -s.thX);
    setSeg(this.ropes[0], V(s.x - .08, 3.3, s.z), V(hp.x - .08, hp.y + .45, hp.z));
    setSeg(this.ropes[1], V(s.x + .08, 3.3, s.z), V(hp.x + .08, hp.y + .45, hp.z));
    const att = this.attached;
    if (att) {
      att.group.position.set(att.x, att.y, att.z);
      if (this.lift) { const t = this.tilt()!; att.tilt.rotation.set(-t.z * Math.PI / 180, 0, t.x * Math.PI / 180); }
      else if (s.load && !s.load.resting) att.tilt.rotation.set(s.thZ * .9, 0, -s.thX * .9);
      else att.tilt.rotation.set(0, 0, 0);
    }
    if (att && this.attachKind === 'model') { setSeg(this.sling, V(hp.x, hp.y + .05, hp.z), V(att.x, att.y + att.lugH, att.z)); for (const c of this.chains) c.visible = false; }
    else if (att && this.attachKind === 'form') {
      this.sling.visible = false; const pts = this.yard.formHookPoints(att);
      this.chains.forEach((c, i) => { if (pts[i]) setSeg(c, V(hp.x, hp.y + .03, hp.z), pts[i]); else c.visible = false; });
    } else setSeg(this.sling, V(hp.x, hp.y + .05, hp.z), V(hp.x - .05, hp.y - .35, hp.z));
  }

  hookWorld(): THREE.Vector3 { const h = hookPosition(this.state); return V(h.x, h.y, h.z); }
}
