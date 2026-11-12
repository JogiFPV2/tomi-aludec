/**
 * Logika sypania masy formierskiej – bez grafiki, w pełni testowalna.
 *
 * - Start: czas liczy się od razu, masa leci po opóźnieniu (np. 2 s).
 * - Pauza: masa przestaje lecieć; po przekroczeniu limitu (np. 15 s) masa w ramieniu słabnie.
 * - Wyładuj: wyrzuca słabą masę (trwa kilka sekund), potem po Start leci dobra.
 * - Masa układa się w siatce wysokości; przesypuje się na boki jak piasek.
 * - Metale trzeba podbić określoną liczbę razy, gdy masa dochodzi do ich krawędzi.
 * - Haki wstawia się, gdy masa jest w określonym oknie wysokości.
 */
import { metalById } from '../../data/metals';
import { patternTop, type ModelDef } from '../../data/models';

export interface PourBalance {
  startDelaySec: number; maxPauseSec: number; unloadSec: number; flowRate: number; armSpeed: number;
  tapPenalty: number[]; missingHookPenalty: number; spillPenaltyPerKg: number; weakPenalty: number;
  basePoints: number; targetTimeSec: number; timeBonusMax: number;
}

export type MachineState = 'stoi' | 'start' | 'sypie' | 'pauza' | 'wyladunek';

export interface MetalState { slot: string; metalId: string; x: number; z: number; top: number; need: number; taps: number; buried: boolean }
export interface HookState { x: number; z: number; placed: boolean; depthOk?: boolean }

export interface PourResult {
  timeSec: number; fill: number; tapMissing: { slot: string; metalId: string; missing: number; need: number; penalty: number }[];
  hooksMissing: number; spillKg: number; weakKg: number; overflow: number; points: number; breakdown: { label: string; pts: number }[];
}

export const NX = 30, NZ = 22;
const DENSITY = 1500; // kg/m³ – do przeliczenia objętości na kilogramy

export class PourSim {
  readonly def: ModelDef;
  readonly dx: number; readonly dz: number;
  base = new Float32Array(NX * NZ);   // wysokość wzoru + metali
  sand = new Float32Array(NX * NZ);   // grubość masy
  weak = new Float32Array(NX * NZ);   // ile w tym słabej masy
  machine: MachineState = 'stoi';
  t = 0;                // czas od pierwszego Start
  started = false;
  delay = 0;            // pozostałe opóźnienie
  pauseT = 0;           // jak długo trwa obecna pauza
  massWeak = false;     // masa w ramieniu jest słaba
  unloadT = 0;
  arm = { x: 0, z: 0, tx: 0, tz: 0 };
  spillKg = 0; weakKg = 0;
  metals: MetalState[]; hooks: HookState[];
  finished = false;

  constructor(def: ModelDef, public bal: PourBalance) {
    this.def = def;
    this.dx = def.inner.l / (NX - 1); this.dz = def.inner.w / (NZ - 1);
    this.metals = def.metals.map(m => { const md = metalById(m.metalId); return { slot: m.slot, metalId: m.metalId, x: m.x, z: m.z, top: md ? md.size[2] : .1, need: m.taps, taps: 0, buried: false }; });
    this.hooks = def.hooks.map(h => ({ x: h.x, z: h.z, placed: false }));
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = this.cx(i), z = this.cz(j); let b = patternTop(def, x, z);
      for (const m of this.metals) { const md = metalById(m.metalId); const s = md?.size ?? [.12, .08, .1]; if (Math.abs(x - m.x) < s[0] / 2 + .01 && Math.abs(z - m.z) < s[1] / 2 + .01) b = Math.max(b, m.top); }
      this.base[j * NX + i] = b;
    }
    this.arm.x = this.arm.tx = -def.inner.l / 2 - .3; this.arm.z = this.arm.tz = -def.inner.w / 2 - .2; // ramię zaparkowane obok
  }

  cx(i: number) { return -this.def.inner.l / 2 + i * this.dx; }
  cz(j: number) { return -this.def.inner.w / 2 + j * this.dz; }
  idx(x: number, z: number) { const i = Math.round((x + this.def.inner.l / 2) / this.dx), j = Math.round((z + this.def.inner.w / 2) / this.dz); return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i; }
  surface(x: number, z: number) { const c = this.idx(x, z); return c < 0 ? 0 : this.base[c] + this.sand[c]; }
  /** wysokość samej masy w okolicy (średnia z sąsiedztwa) – do podbić i haków */
  sandLevelNear(x: number, z: number, r = .07) {
    let s = 0, n = 0;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const c = j * NX + i; const d = Math.hypot(this.cx(i) - x, this.cz(j) - z); if (d <= r && this.base[c] < .05) { s += this.sand[c]; n++; } }
    return n ? s / n : this.surface(x, z);
  }

  // ===== przyciski maszyny =====
  start(): string | null {
    if (this.finished) return 'Sypanie zakończone.';
    if (this.machine === 'wyladunek') return 'Poczekaj, maszyna się wyładowuje.';
    if (this.machine === 'start' || this.machine === 'sypie') return null;
    this.started = true; this.machine = 'start'; this.delay = this.bal.startDelaySec; this.pauseT = 0;
    return this.massWeak ? 'Uwaga: masa po długiej pauzie jest słaba – lepiej ją wyładować.' : null;
  }
  pause(): string | null {
    if (this.machine !== 'sypie' && this.machine !== 'start') return null;
    this.machine = 'pauza'; this.pauseT = 0; return null;
  }
  unload(): string | null {
    if (this.machine === 'sypie' || this.machine === 'start') return 'Najpierw wciśnij Pauzę.';
    if (this.machine === 'wyladunek') return null;
    this.machine = 'wyladunek'; this.unloadT = this.bal.unloadSec; return null;
  }
  setArmTarget(x: number, z: number) {
    const lim = { x: this.def.inner.l / 2 + .5, z: this.def.inner.w / 2 + .4 };
    this.arm.tx = Math.max(-lim.x, Math.min(lim.x, x)); this.arm.tz = Math.max(-lim.z, Math.min(lim.z, z));
  }
  armOverModel() { return Math.abs(this.arm.x) <= this.def.inner.l / 2 && Math.abs(this.arm.z) <= this.def.inner.w / 2; }

  /** Podbicie metalu – zwraca komunikat dla gracza. */
  tapMetal(k: number): { ok: boolean; msg: string } {
    const m = this.metals[k]; if (!m) return { ok: false, msg: '' };
    if (m.taps >= m.need) return { ok: false, msg: `${m.metalId}: już podbity` };
    const lvl = this.sandLevelNear(m.x, m.z);
    if (lvl < m.top * .6) return { ok: false, msg: `Za wcześnie – masa jeszcze nie doszła do metalu ${m.metalId}` };
    if (m.buried || lvl > m.top + .12) { m.buried = true; return { ok: false, msg: `Za późno – metal ${m.metalId} już zasypany` }; }
    m.taps++; return { ok: true, msg: `${m.metalId}: podbicie ${m.taps}/${m.need}` };
  }

  placeHook(k: number): { ok: boolean; msg: string } {
    const h = this.hooks[k]; if (!h || h.placed) return { ok: false, msg: '' };
    const lvl = this.surface(h.x, h.z); const [lo, hi] = this.def.hookWindow;
    if (lvl < lo) return { ok: false, msg: 'Za wcześnie na hak – nasyp więcej masy' };
    if (lvl > hi) return { ok: false, msg: 'Za późno – hak nie będzie dobrze osadzony' };
    h.placed = true; h.depthOk = true; return { ok: true, msg: 'Hak Ω osadzony' };
  }

  fill(): number { let n = 0; const H = this.def.inner.h; for (let c = 0; c < NX * NZ; c++) if (this.base[c] + this.sand[c] >= H - .02) n++; return n / (NX * NZ); }
  /** Średni poziom masy 0..1 względem wysokości modelu – do przekroju. */
  profile(): number[] { const H = this.def.inner.h; const out: number[] = []; for (let i = 0; i < NX; i++) { let s = 0; for (let j = 0; j < NZ; j++) { const c = j * NX + i; s += this.base[c] + this.sand[c]; } out.push(Math.min(1.2, s / NZ / H)); } return out; }

  step(dt: number) {
    if (this.finished) return;
    if (this.started) this.t += dt;
    // ramię
    const dxA = this.arm.tx - this.arm.x, dzA = this.arm.tz - this.arm.z, d = Math.hypot(dxA, dzA), st = Math.min(d, this.bal.armSpeed * dt);
    if (d > 1e-4) { this.arm.x += dxA / d * st; this.arm.z += dzA / d * st; }
    // maszyna
    if (this.machine === 'start') { this.delay -= dt; if (this.delay <= 0) this.machine = 'sypie'; }
    else if (this.machine === 'pauza') { this.pauseT += dt; if (this.pauseT > this.bal.maxPauseSec) this.massWeak = true; }
    else if (this.machine === 'wyladunek') { this.unloadT -= dt; if (this.unloadT <= 0) { this.machine = 'stoi'; this.massWeak = false; this.pauseT = 0; } }
    if (this.machine === 'sypie') this.pourAt(this.arm.x, this.arm.z, dt);
    this.relax();
    // metale zasypane
    for (const m of this.metals) if (!m.buried && this.sandLevelNear(m.x, m.z) > m.top + .12) m.buried = true;
  }

  private pourAt(x: number, z: number, dt: number) {
    const vol = this.bal.flowRate * dt; // m³
    const kg = vol * DENSITY;
    if (this.massWeak) this.weakKg += kg;
    if (!this.armOverModel()) { this.spillKg += kg; return; }
    const sg = .09, cellA = this.dx * this.dz; let wsum = 0; const ws: [number, number][] = [];
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const dd = (this.cx(i) - x) ** 2 + (this.cz(j) - z) ** 2; if (dd > (sg * 3) ** 2) continue; const w = Math.exp(-dd / (2 * sg * sg)); ws.push([j * NX + i, w]); wsum += w; }
    const H = this.def.inner.h;
    for (const [c, w] of ws) {
      let add = vol * (w / wsum) / cellA;
      const room = H + .08 - (this.base[c] + this.sand[c]);
      if (add > room) { this.spillKg += (add - Math.max(0, room)) * cellA * DENSITY; add = Math.max(0, room); }
      this.sand[c] += add; if (this.massWeak) this.weak[c] += add;
    }
  }

  private relax() {
    const T = .035; // kąt usypu – maks. różnica wysokości między sąsiadami
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const c = j * NX + i; const s = this.base[c] + this.sand[c];
      for (const n of [i < NX - 1 ? c + 1 : -1, j < NZ - 1 ? c + NX : -1]) {
        if (n < 0) continue; const sn = this.base[n] + this.sand[n]; const diff = s - sn;
        if (Math.abs(diff) <= T) continue;
        const [from, to] = diff > 0 ? [c, n] : [n, c]; const mv = Math.min(this.sand[from], (Math.abs(diff) - T) * .25);
        if (mv <= 0) continue; this.sand[from] -= mv; this.sand[to] += mv;
      }
    }
  }

  /** Najniższe miejsce w modelu – podpowiedź, gdzie sypać. */
  lowestPoint(): { x: number; z: number } {
    let best = 1e9, bx = 0, bz = 0;
    for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) { const c = j * NX + i; const s = this.base[c] + this.sand[c]; if (s < best - 1e-6) { best = s; bx = this.cx(i); bz = this.cz(j); } }
    return { x: bx, z: bz };
  }

  canFinish() { return this.fill() >= .97 && this.machine !== 'sypie' && this.machine !== 'start'; }

  finish(): PourResult {
    this.finished = true; this.machine = 'stoi';
    const b = this.bal; const breakdown: { label: string; pts: number }[] = [];
    breakdown.push({ label: 'Forma zasypana', pts: b.basePoints });
    const tapMissing = this.metals.filter(m => m.taps < m.need).map(m => {
      const missing = m.need - m.taps; const ratio = missing / m.need;
      // przykład z założeń dla metalu na 3 podbicia: brak 1 → −30, brak 2 → −70, brak 3 → −100
      const pen = ratio >= .99 ? b.tapPenalty[2] : ratio >= .5 ? b.tapPenalty[1] : b.tapPenalty[0];
      return { slot: m.slot, metalId: m.metalId, missing, need: m.need, penalty: pen };
    });
    for (const t of tapMissing) breakdown.push({ label: `Metal ${t.metalId} (${t.slot}): brak ${t.missing} z ${t.need} podbić`, pts: -t.penalty });
    const hooksMissing = this.hooks.filter(h => !h.placed).length;
    if (hooksMissing) breakdown.push({ label: `Brak haków: ${hooksMissing}`, pts: -hooksMissing * b.missingHookPenalty });
    if (this.spillKg > 1) breakdown.push({ label: `Masa obok modelu: ${Math.round(this.spillKg)} kg`, pts: -Math.min(150, Math.round(this.spillKg * b.spillPenaltyPerKg)) });
    if (this.weakKg > 5) breakdown.push({ label: 'Sypanie słabą masą po długiej pauzie', pts: -b.weakPenalty });
    const bonus = Math.round(Math.max(0, Math.min(1, (b.targetTimeSec * 1.6 - this.t) / (b.targetTimeSec * .6))) * b.timeBonusMax);
    if (bonus) breakdown.push({ label: `Tempo (${Math.round(this.t)} s)`, pts: bonus });
    let overflow = 0; for (let c = 0; c < NX * NZ; c++) if (this.base[c] + this.sand[c] > this.def.inner.h + .05) overflow++;
    const points = breakdown.reduce((s, x) => s + x.pts, 0);
    return { timeSec: this.t, fill: this.fill(), tapMissing, hooksMissing, spillKg: this.spillKg, weakKg: this.weakKg, overflow: overflow / (NX * NZ), points, breakdown };
  }
}
