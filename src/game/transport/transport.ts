import * as THREE from 'three';
import { Builder, V } from '../render/build';
import type { Yard, Load } from '../crane/yard';
import type { CollisionWorld } from '../world/collision';
import type { EventBus } from '../../core/events';
import { STATIONS, SLOT_X, MODELS, PALLET_STACKS, JACKS, type JackSpawn } from '../../data/layout';
import { PALLET, topOf, covers, stackAt, nearestStack, placeAt, takeTop, turnToward, type Stack, type TransportBalance } from './stacking';

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
  /** obrót palety niesionej w rękach (true = dłuższym bokiem wzdłuż osi z) */
  handRot = false;
  private ghost: THREE.Mesh;
  private handMesh = new THREE.Group();
  private n = 0;

  constructor(private b: Builder, private yard: Yard, private col: CollisionWorld, private bal: TransportBalance, private bus: EventBus) {
    for (const s of PALLET_STACKS) this.addStack(s.x, s.z, s.count);
    for (const m of MODELS) this.addStack(m.x, m.z, 1);
    for (const j of JACKS) this.addJack(j);
    this.group.add(this.handMesh);
    // podgląd miejsca, w którym paleta wyląduje po odłożeniu
    this.ghost = b.box(PALLET.w, .03, PALLET.d, 'ghost', [0, .02, 0]); this.ghost.castShadow = false; this.ghost.visible = false; this.group.add(this.ghost);
  }

  // ---------- budowa ----------
  addStack(x: number, z: number, count: number, rot = false): StackV {
    const s: StackV = { id: 'pal-' + (++this.n), x, z, count, lift: 0, rot, mesh: new THREE.Group(), shown: -1, jack: null };
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
    s.mesh.position.set(s.x, s.lift, s.z); s.mesh.rotation.y = s.rot ? Math.PI / 2 : 0;
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
    return this.yard.loads.filter(l => !l.heldBy && covers(s, l.x, l.z) && Math.abs(l.y - top) < .04);
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
    this.handMesh.visible = this.hand > 0; this.ghost.visible = false;
    if (this.hand) {
      const d = dir(p.heading); this.handMesh.position.set(x + d.x * .62, .95, z + d.z * .62); this.handMesh.rotation.y = this.handRot ? Math.PI / 2 : 0;
      const t = this.dropPoint({ x, z, heading: p.heading });
      if (t.ok) { this.ghost.visible = true; this.ghost.position.set(t.x, t.y + .02, t.z); this.ghost.rotation.y = t.rot ? Math.PI / 2 : 0; }
    }
    return { x, z };
  }
  /** Gdzie wyląduje paleta z rąk: przed graczem; blisko stosu „przykleja się” do niego. */
  private dropPoint(p: P): { ok: boolean; x: number; z: number; y: number; rot: boolean; why?: string; target?: StackV } {
    const d = dir(p.heading); const x = p.x + d.x * 1.15, z = p.z + d.z * 1.15;
    const f = this.col.resolve(x, z, .5);
    if (Math.hypot(f.x - x, f.z - z) > .12) return { ok: false, x, z, y: 0, rot: this.handRot, why: 'Tu nie ma miejsca na paletę – odsuń się od ściany lub maszyny.' };
    const pl = placeAt(this.stacks, x, z, this.hand, this.bal, s => this.riders(s).length > 0 || !!(s as StackV).jack, null, this.handRot);
    if (pl.kind === 'blocked') return { ok: false, x, z, y: 0, rot: this.handRot, why: pl.reason === 'full' ? `Stos jest pełny (maks. ${this.bal.maxStack} palet).` : pl.reason === 'occupied' ? 'Na tej palecie coś stoi.' : 'Paleta zahacza o inną – podejdź bliżej stosu albo odsuń się.' };
    if (pl.kind === 'merge') { const t = pl.target as StackV; return { ok: true, x: t.x, z: t.z, y: topOf(t), rot: !!t.rot, target: t }; }
    return { ok: true, x, z, y: 0, rot: this.handRot };
  }
  /** Obrót palety o 90°: niesionej w rękach albo pustej na widłach. */
  rotate() {
    if (this.hand) { this.handRot = !this.handRot; return; }
    const c = this.holding?.carry; if (!c) return;
    if (this.riders(c).length) { this.bus.emit('toast', { text: 'Nie obrócisz palety, na której coś stoi.', kind: 'bad' }); return; }
    c.rot = !c.rot; this.sync(c);
  }
  /** Czy da się teraz obrócić paletę (przycisk „Obróć”). */
  canRotate(): boolean { return this.hand > 0 || !!this.holding?.carry; }

  private setHand(n: number) {
    this.hand = n;
    for (const c of [...this.handMesh.children]) { this.handMesh.remove(c); c.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); }
    for (let i = 0; i < n; i++) this.handMesh.add(this.palletMesh(i * PALLET.h));
    this.changed();
  }
  private changed() {
    this.bus.emit('transport:changed', this.holding ? { holding: 'jack', label: 'Puść paleciak', what: this.holding.kind === 'electric' ? 'Paleciak elektryczny' : 'Paleciak ręczny' } : this.hand ? { holding: 'hand', label: this.hand > 1 ? 'Odłóż palety' : 'Odłóż paletę', what: this.hand > 1 ? '2 palety w rękach' : 'Paleta w rękach' } : null);
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
      return s ? { id: 'take2-' + s.id, label: 'Podnieś drugą paletę', dist: 0, run: () => this.takeByHand(s) } : null;
    }
    let best: TAction | null = null;
    for (const jk of this.jacks) { const d = Math.hypot(jk.x - p.x, jk.z - p.z); if (d < 1.3 && (!best || d < best.dist)) best = { id: 'jack-' + jk.id, label: `Weź ${jackName(jk.kind)}`, dist: d, run: () => this.takeJack(jk, p) }; }
    const s = nearestStack(this.stacks.filter(free), p.x, p.z, 1.4) as StackV | null;
    if (s) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (!best || d < best.dist) best = { id: 'take-' + s.id, label: s.count > 1 ? `Podnieś paletę ze stosu (${s.count})` : 'Podnieś paletę', dist: d, run: () => this.takeByHand(s) }; }
    return best;
  }

  /** „Puść / odłóż” (G): puszcza paleciak albo odkłada palety z rąk przed siebie. */
  release(p: P) {
    if (this.holding) { const j = this.holding; this.holding = null; this.changed(); this.bus.emit('toast', { text: `Zostawiasz ${jackName(j.kind)}${j.carry ? ' z paletą' : ''}.` }); return; }
    if (!this.hand) return;
    const t = this.dropPoint(p);
    if (!t.ok) { this.bus.emit('toast', { text: t.why!, kind: 'bad' }); return; }
    if (t.target) { t.target.count += this.hand; this.sync(t.target); this.bus.emit('toast', { text: `Paleta odłożona na stos (${t.target.count}).`, kind: 'ok' }); }
    else { this.addStack(t.x, t.z, this.hand, t.rot); this.bus.emit('toast', { text: this.hand > 1 ? 'Palety odłożone.' : 'Paleta odłożona.', kind: 'ok' }); }
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
    if (!this.hand) this.handRot = !!s.rot;
    if (s.count === 0) this.removeStack(s); else this.sync(s);
    this.setHand(this.hand + k);
    this.bus.emit('toast', { text: this.hand > 1 ? 'Niesiesz dwie palety – idziesz wolniej.' : 'Niesiesz paletę – idziesz wolniej. Żółty ślad pokazuje, gdzie ją odłożysz; możesz ją obrócić.' });
  }
  private liftStack(j: Jack, s: StackV) {
    j.carry = s; s.jack = j; const f = this.forkPoint(j); this.moveStack(s, f.x, f.z, this.bal.jackLift); this.place(j);
    this.bus.emit('toast', { text: 'Paleta na widłach.', kind: 'ok' });
  }
  private dropStack(j: Jack) {
    const c = j.carry!; const pl = placeAt(this.stacks, c.x, c.z, c.count, this.bal, s => this.riders(s).length > 0 || !!(s as StackV).jack, c, c.rot);
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
