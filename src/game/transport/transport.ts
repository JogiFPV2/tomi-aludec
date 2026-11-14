import * as THREE from 'three';
import { Builder, V } from '../render/build';
import type { Yard, Load } from '../crane/yard';
import type { CollisionWorld } from '../world/collision';
import type { EventBus } from '../../core/events';
import { STATIONS, SLOT_X, MODELS, PALLET_STACKS, JACKS, type JackSpawn } from '../../data/layout';
import { PALLET, topOf, stackAt, nearestStack, placeAt, takeTop, turnToward, type Stack, type TransportBalance } from './stacking';

/**
 * Transport na hali: palety (stosy), noszenie palet w rękach i paleciaki (ręczne i elektryczne).
 * Ładunki z suwnic (modele, formy) stojące na palecie jadą razem z nią.
 */
interface StackV extends Stack { mesh: THREE.Group; shown: number; jack: Jack | null }
export interface Jack { id: string; kind: JackSpawn['kind']; x: number; z: number; heading: number; carry: StackV | null; group: THREE.Group; forks: THREE.Group }
export interface TAction { id: string; label: string; dist: number; run: () => void }
interface P { x: number; z: number; heading: number }

const HANDLE = .5;  // gracz → dyszel paleciaka
const FORK = .95;   // dyszel → środek wideł
const dir = (h: number) => ({ x: Math.sin(h), z: Math.cos(h) });
const jackName = (k: Jack['kind']) => k === 'electric' ? 'paleciak elektryczny' : 'paleciak ręczny';

export class Transport {
  group = new THREE.Group();
  stacks: StackV[] = [];
  jacks: Jack[] = [];
  /** paleciak prowadzony przez gracza */
  holding: Jack | null = null;
  /** palety niesione w rękach */
  hand = 0;
  private handMesh = new THREE.Group();
  private n = 0;

  constructor(private b: Builder, private yard: Yard, private col: CollisionWorld, private bal: TransportBalance, private bus: EventBus) {
    for (const s of PALLET_STACKS) this.addStack(s.x, s.z, s.count);
    for (const m of MODELS) this.addStack(m.x, m.z, 1);
    for (const j of JACKS) this.addJack(j);
    this.group.add(this.handMesh);
  }

  // ---------- budowa ----------
  addStack(x: number, z: number, count: number): StackV {
    const s: StackV = { id: 'pal-' + (++this.n), x, z, count, lift: 0, mesh: new THREE.Group(), shown: -1, jack: null };
    this.group.add(s.mesh); this.stacks.push(s); this.sync(s); return s;
  }
  private palletMesh(y: number): THREE.Group {
    const b = this.b, g = new THREE.Group(); g.position.y = y; const { w, d, h } = PALLET;
    for (const z of [-d / 2 + .07, 0, d / 2 - .07]) g.add(b.box(w, .05, .14, 'pallet', [0, .025, z]));
    for (const x of [-w / 2 + .07, 0, w / 2 - .07]) for (const z of [-d / 2 + .07, 0, d / 2 - .07]) g.add(b.box(.14, .05, .14, 'pallet', [x, .07, z]));
    for (let i = 0; i < 5; i++) g.add(b.box(.2, h - .1, d, 'pallet', [-w / 2 + .1 + i * (w - .2) / 4, .1 + (h - .1) / 2, 0]));
    return g;
  }
  private sync(s: StackV) {
    if (s.shown !== s.count) {
      for (const c of [...s.mesh.children]) { s.mesh.remove(c); c.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); }
      for (let i = 0; i < s.count; i++) s.mesh.add(this.palletMesh(i * PALLET.h));
      s.shown = s.count;
    }
    s.mesh.position.set(s.x, s.lift, s.z);
  }
  private removeStack(s: StackV) { this.group.remove(s.mesh); this.stacks = this.stacks.filter(x => x !== s); s.count = 0; s.shown = -1; s.mesh.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); }

  private addJack(sp: JackSpawn) {
    const b = this.b, g = new THREE.Group(), forks = new THREE.Group(); const el = sp.kind === 'electric';
    for (const x of [-.27, .27]) { forks.add(b.box(.17, .05, 1.2, el ? 'yellow' : 'orange', [x, .075, .88])); forks.add(b.cyl(.04, .04, .15, 'rubber', [x, .04, 1.35], [0, 0, Math.PI / 2], 8)); }
    forks.add(b.box(.72, .1, .12, el ? 'yellow' : 'orange', [0, .1, .3]));
    g.add(forks);
    if (el) { g.add(b.box(.74, .62, .42, 'blue', [0, .37, .06]), b.box(.74, .05, .44, 'yellow', [0, .7, .06]), b.box(.2, .1, .12, 'redBtn', [.2, .76, .06])); }
    else g.add(b.box(.3, .42, .22, 'orange', [0, .3, .14]), b.cyl(.05, .05, .5, 'steel', [0, .5, .14], undefined, 8));
    g.add(b.cyl(.1, .1, .12, 'rubber', [0, .1, .02], [0, 0, Math.PI / 2], 12));
    g.add(b.limb(V(0, el ? .7 : .55, .06), V(0, 1.05, -.3), .028, 'dark', 8));
    g.add(b.box(.4, .05, .05, 'dark', [0, 1.06, -.31]), b.box(.08, .1, .08, el ? 'yellow' : 'orange', [0, 1.02, -.3]));
    const j: Jack = { id: sp.id, kind: sp.kind, x: sp.x, z: sp.z, heading: sp.heading, carry: null, group: g, forks };
    this.group.add(g); this.jacks.push(j); this.place(j);
  }
  private place(j: Jack) { j.group.position.set(j.x, 0, j.z); j.group.rotation.y = j.heading; j.forks.position.y = j.carry ? this.bal.jackLift : 0; }
  private forkPoint(j: Jack) { const d = dir(j.heading); return { x: j.x + d.x * FORK, z: j.z + d.z * FORK }; }

  // ---------- podłoże dla suwnic ----------
  supportAt(x: number, z: number): number { const s = stackAt(this.stacks, x, z); return s ? topOf(s) : 0; }
  palletTopAt(x: number, z: number): number | null { const s = stackAt(this.stacks, x, z); return s ? topOf(s) : null; }

  // ---------- ładunki jadące na palecie ----------
  private riders(s: Stack): Load[] {
    const top = topOf(s);
    return this.yard.loads.filter(l => !l.heldBy && Math.abs(l.x - s.x) <= PALLET.w / 2 && Math.abs(l.z - s.z) <= PALLET.d / 2 && Math.abs(l.y - top) < .04);
  }
  private shift(ls: Load[], dx: number, dy: number, dz: number) { for (const l of ls) { l.x += dx; l.y += dy; l.z += dz; l.group.position.set(l.x, l.y, l.z); } }
  private moveStack(s: StackV, x: number, z: number, lift: number) {
    const r = this.riders(s); this.shift(r, x - s.x, lift - s.lift, z - s.z); s.x = x; s.z = z; s.lift = lift; this.sync(s);
  }

  // ---------- prędkość gracza ----------
  speed(walk: number, run: number, running: boolean): number {
    if (this.holding) return this.holding.kind === 'electric' ? this.bal.jackElectricSpeed : this.bal.jackManualSpeed;
    if (this.hand) return walk * (this.bal.handSpeed[this.hand - 1] ?? .5);
    return running ? run : walk;
  }

  /** Co klatkę: prowadzi paleciak przed graczem. Zwraca poprawione położenie gracza (kolizje wideł). */
  update(dt: number, p: P): { x: number; z: number } {
    let { x, z } = p;
    const j = this.holding;
    if (j) {
      j.heading = turnToward(j.heading, p.heading, this.bal.jackTurn * dt);
      const d = dir(j.heading); const r = j.carry ? .55 : .25;
      // środek wideł nie może wjechać w ściany i maszyny – cofamy gracza
      const fx = x + d.x * (HANDLE + FORK), fz = z + d.z * (HANDLE + FORK); const f = this.col.resolve(fx, fz, r);
      x += f.x - fx; z += f.z - fz;
      j.x = x + d.x * HANDLE; j.z = z + d.z * HANDLE; this.place(j);
      if (j.carry) { const fp = this.forkPoint(j); this.moveStack(j.carry, fp.x, fp.z, this.bal.jackLift); }
    }
    this.handMesh.visible = this.hand > 0;
    if (this.hand) { const d = dir(p.heading); this.handMesh.position.set(x + d.x * .62, .95, z + d.z * .62); this.handMesh.rotation.y = p.heading + Math.PI / 2; }
    return { x, z };
  }
  private setHand(n: number) {
    this.hand = n;
    for (const c of [...this.handMesh.children]) { this.handMesh.remove(c); c.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); }
    for (let i = 0; i < n; i++) this.handMesh.add(this.palletMesh(i * PALLET.h));
    this.changed();
  }
  private changed() {
    this.bus.emit('transport:changed', this.holding ? { holding: 'jack', label: 'Puść paleciak' } : this.hand ? { holding: 'hand', label: this.hand > 1 ? 'Odłóż palety' : 'Odłóż paletę' } : null);
  }

  // ---------- akcje ----------
  /** Najbliższa możliwa akcja „użyj” (E) związana z transportem. */
  action(p: P): TAction | null {
    const j = this.holding;
    if (j) {
      const f = this.forkPoint(j);
      if (!j.carry) {
        const s = nearestStack(this.stacks.filter(s => !s.jack), f.x, f.z, .75) as StackV | null;
        return s ? { id: 'lift-' + s.id, label: `Podnieś widłami (${s.count} ${s.count === 1 ? 'paleta' : 'palety'})`, dist: 0, run: () => this.liftStack(j, s) } : null;
      }
      const c = j.carry, r = this.riders(c);
      for (const st of STATIONS) for (let i = 0; i < SLOT_X.length; i++) {
        const sx = st.x + SLOT_X[i];
        if (Math.abs(f.x - sx) > .7 || Math.abs(f.z - st.z) > 1.75) continue;
        const occ = this.yard.loads.find(l => l.kind === 'model' && Math.abs(l.x - sx) < .35 && Math.abs(l.z - st.z) < .25 && Math.abs(l.y - .5) < .02);
        if (r.length === 1 && r[0].kind === 'model' && !occ) return { id: `in-${st.id}-${i}`, label: `Wstaw model na rolotok (miejsce ${i + 1})`, dist: 0, run: () => this.toRoller(r[0], sx, st.z, st.name, i) };
        if (!r.length && occ && !occ.heldBy) return { id: `out-${st.id}-${i}`, label: `Zdejmij model z rolotoku (miejsce ${i + 1})`, dist: 0, run: () => this.fromRoller(occ, c) };
      }
      return { id: 'drop-' + c.id, label: r.length ? `Odstaw paletę (${r[0].kind === 'form' ? 'z formą' : 'z modelem'})` : `Odstaw ${c.count === 1 ? 'paletę' : `palety (${c.count})`}`, dist: 0, run: () => this.dropStack(j) };
    }
    const free = (s: StackV) => !s.jack && s.count > 0 && !this.riders(s).length;
    if (this.hand) {
      if (this.hand >= this.bal.handMax) return null;
      const s = nearestStack(this.stacks.filter(free), p.x, p.z, 1.5) as StackV | null;
      return s ? { id: 'take2-' + s.id, label: 'Weź drugą paletę', dist: 0, run: () => this.takeByHand(s) } : null;
    }
    let best: TAction | null = null;
    for (const jk of this.jacks) { const d = Math.hypot(jk.x - p.x, jk.z - p.z); if (d < 1.3 && (!best || d < best.dist)) best = { id: 'jack-' + jk.id, label: `Weź ${jackName(jk.kind)}`, dist: d, run: () => this.takeJack(jk, p) }; }
    const s = nearestStack(this.stacks.filter(free), p.x, p.z, 1.4) as StackV | null;
    if (s) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (!best || d < best.dist) best = { id: 'take-' + s.id, label: s.count > 1 ? `Weź paletę ze stosu (${s.count})` : 'Weź paletę', dist: d, run: () => this.takeByHand(s) }; }
    return best;
  }

  /** „Puść / odłóż” (G): puszcza paleciak albo odkłada palety z rąk przed siebie. */
  release(p: P) {
    if (this.holding) { const j = this.holding; this.holding = null; this.changed(); this.bus.emit('toast', { text: `Zostawiasz ${jackName(j.kind)}${j.carry ? ' z paletą' : ''}.` }); return; }
    if (!this.hand) return;
    const d = dir(p.heading); const x = p.x + d.x * 1.05, z = p.z + d.z * 1.05;
    const f = this.col.resolve(x, z, .5);
    if (Math.hypot(f.x - x, f.z - z) > .12) { this.bus.emit('toast', { text: 'Tu nie ma miejsca na paletę – odsuń się od ściany lub maszyny.', kind: 'bad' }); return; }
    const pl = placeAt(this.stacks, x, z, this.hand, this.bal, s => this.riders(s).length > 0 || !!(s as StackV).jack);
    if (pl.kind === 'blocked') { this.bus.emit('toast', { text: pl.reason === 'full' ? `Stos jest pełny (maks. ${this.bal.maxStack} palet).` : pl.reason === 'occupied' ? 'Na tej palecie coś stoi.' : 'Paleta zahacza o inną – podejdź bliżej stosu albo odsuń się.', kind: 'bad' }); return; }
    if (pl.kind === 'merge') { const t = pl.target as StackV; t.count += this.hand; this.sync(t); this.bus.emit('toast', { text: `Paleta odłożona na stos (${t.count}).`, kind: 'ok' }); }
    else { this.addStack(x, z, this.hand); this.bus.emit('toast', { text: this.hand > 1 ? 'Palety odłożone.' : 'Paleta odłożona.', kind: 'ok' }); }
    this.setHand(0);
  }

  private takeJack(j: Jack, p: P) {
    // gracz staje za dyszlem – paleciak zostaje tam, gdzie stał
    this.holding = j; this.changed();
    this.bus.emit('toast', { text: `Prowadzisz ${jackName(j.kind)}. Wjedź widłami pod paletę i naciśnij „użyj”.`, kind: 'ok' });
    void p;
  }
  /** Gdzie ma stanąć gracz po złapaniu paleciaka (za dyszlem, twarzą do wideł). */
  gripPose(): P | null { const j = this.holding; if (!j) return null; const d = dir(j.heading); return { x: j.x - d.x * HANDLE, z: j.z - d.z * HANDLE, heading: j.heading }; }

  private takeByHand(s: StackV) {
    const k = takeTop(s, 1); if (!k) return;
    if (s.count === 0) this.removeStack(s); else this.sync(s);
    this.setHand(this.hand + k);
    this.bus.emit('toast', { text: this.hand > 1 ? 'Niesiesz dwie palety – idziesz wolniej.' : 'Niesiesz paletę. Odłóż ją przyciskiem „Odłóż paletę”.' });
  }
  private liftStack(j: Jack, s: StackV) {
    j.carry = s; s.jack = j; const f = this.forkPoint(j); this.moveStack(s, f.x, f.z, this.bal.jackLift); this.place(j);
    this.bus.emit('toast', { text: 'Paleta na widłach.', kind: 'ok' });
  }
  private dropStack(j: Jack) {
    const c = j.carry!; const pl = placeAt(this.stacks, c.x, c.z, c.count, this.bal, s => this.riders(s).length > 0 || !!(s as StackV).jack, c);
    if (pl.kind === 'blocked') { this.bus.emit('toast', { text: pl.reason === 'full' ? `Stos byłby za wysoki (maks. ${this.bal.maxStack} palet).` : pl.reason === 'occupied' ? 'Na tamtej palecie coś stoi.' : 'Paleta zahacza o inną – ustaw się równo nad stosem albo obok.', kind: 'bad' }); return; }
    j.carry = null; c.jack = null;
    if (pl.kind === 'merge') {
      const t = pl.target as StackV; const r = this.riders(c); t.count += c.count; this.shift(r, t.x - c.x, topOf(t) - topOf(c), t.z - c.z); this.removeStack(c); this.sync(t);
      this.bus.emit('toast', { text: `Palety ułożone w stos (${t.count}).`, kind: 'ok' });
    } else { this.moveStack(c, c.x, c.z, 0); this.bus.emit('toast', { text: 'Paleta odstawiona.', kind: 'ok' }); }
    this.place(j);
  }
  private toRoller(l: Load, x: number, z: number, station: string, slot: number) {
    l.x = x; l.z = z; l.y = .5; l.group.position.set(x, .5, z);
    this.bus.emit('toast', { text: `${l.name} na rolotoku (${station}, miejsce ${slot + 1})`, kind: 'ok' });
  }
  private fromRoller(l: Load, c: StackV) {
    l.x = c.x; l.z = c.z; l.y = topOf(c); l.group.position.set(l.x, l.y, l.z);
    this.bus.emit('toast', { text: `${l.name} na palecie.`, kind: 'ok' });
  }
}
