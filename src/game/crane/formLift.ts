/**
 * Wyciąganie formy z modelu – czysta logika (bez grafiki).
 *
 * Forma wisi na łańcuchach zaczepionych o haki Ω. Podczas wyciągania z modelu forma
 * sama „ucieka” w przechył (tarcie o ściany, nierówno osadzone haki, bujanie).
 * Gracz koryguje przechył, skracając lub luzując pojedyncze łańcuchy.
 *  – przechył ponad próg ostrzeżenia → kara punktowa (narasta z czasem i wielkością przechyłu),
 *  – przechył ponad próg pęknięcia → forma pęka (trzeba ją zasypać od nowa).
 * Po wyjęciu formy z modelu przechył już jej nie grozi – trzeba ją tylko odłożyć na paletę.
 */

export interface LiftBalance {
  warnDeg: number;          // od tego przechyłu nalicza się kara
  crackDeg: number;         // od tego przechyłu forma pęka
  penaltyPerDegSec: number; // kara za każdy stopień ponad próg na sekundę
  crackPenalty: number;     // kara za pękniętą formę
  driftDegPerM: number;     // jak szybko forma ucieka w przechył na metr wyciągania (przy nierównowadze 1)
  baseImbalance: number;    // nierównowaga przy idealnie osadzonych hakach
  swingCoupling: number;    // ile stopni przechyłu daje stopień bujania liny
  chainRate: number;        // m/s – skracanie/luzowanie łańcucha
  extractPoints: number;    // punkty za wyjęcie formy bez pęknięcia
  palletPoints: number;     // punkty za odłożenie formy na paletę
  floorPenalty: number;     // kara za odstawienie formy na posadzkę
}

export interface LiftHook { x: number; z: number; ok?: boolean }

export interface LiftState {
  hooks: LiftHook[];
  /** skrócenie łańcucha (m) – dodatnie = łańcuch krótszy, ten róg idzie w górę */
  chains: number[];
  sel: number;
  /** kierunek i siła samoczynnego przechyłu */
  imb: { x: number; z: number };
  /** przechył narosły podczas wyciągania (stopnie) */
  drift: { x: number; z: number };
  /** ile forma już wysunęła się z modelu (m) */
  lifted: number;
  depth: number;
  inModel: boolean;
  penalty: number;
  maxTilt: number;
  cracked: boolean;
}

/** Prosty, powtarzalny generator liczb (ziarno = numer formy) – ten sam układ daje ten sam wynik. */
export function rng(seed: number) { let x = (seed >>> 0) || 1; return () => ((x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) ^ (x + 0x6d2b79f5)) >>> 0) / 4294967296; }

/**
 * Nierównowaga formy: haki osadzone za późno/za wcześnie albo brakujące przesuwają środek zawieszenia
 * względem środka masy. Do tego mała losowa „kapryśność” każdej formy.
 */
export function imbalanceOf(designed: LiftHook[], placed: LiftHook[], bal: LiftBalance, seed: number): { x: number; z: number } {
  const r = rng(seed); const a = r() * Math.PI * 2;
  let x = Math.cos(a) * bal.baseImbalance, z = Math.sin(a) * bal.baseImbalance;
  const c = (l: LiftHook[]) => l.length ? { x: l.reduce((s, h) => s + h.x, 0) / l.length, z: l.reduce((s, h) => s + h.z, 0) / l.length } : { x: 0, z: 0 };
  const cd = c(designed), cp = c(placed);
  x += (cp.x - cd.x) * 3; z += (cp.z - cd.z) * 3;
  for (const h of placed) if (h.ok === false) { x += Math.sign(h.x || .01) * .35; z += Math.sign(h.z || .01) * .35; }
  // jeden łańcuch nie pozwala korygować przechyłu – taka forma ucieka wolniej
  if (placed.length === 1) { x *= .35; z *= .35; }
  return { x, z };
}

export function createLift(hooks: LiftHook[], imb: { x: number; z: number }, depth: number): LiftState {
  return { hooks, chains: hooks.map(() => 0), sel: 0, imb, drift: { x: 0, z: 0 }, lifted: 0, depth, inModel: true, penalty: 0, maxTilt: 0, cracked: false };
}

/** Przechył wynikający z długości łańcuchów (stopnie): płaszczyzna dopasowana do zaczepów. */
export function chainTilt(s: LiftState): { x: number; z: number } {
  let sxx = 0, sxc = 0, szz = 0, szc = 0;
  const n = s.hooks.length; const cx = s.hooks.reduce((a, h) => a + h.x, 0) / n, cz = s.hooks.reduce((a, h) => a + h.z, 0) / n;
  s.hooks.forEach((h, i) => { const dx = h.x - cx, dz = h.z - cz; sxx += dx * dx; sxc += dx * s.chains[i]; szz += dz * dz; szc += dz * s.chains[i]; });
  const deg = (v: number) => Math.atan(v) * 180 / Math.PI;
  // skrócony łańcuch po stronie +x unosi stronę +x → przechył w przeciwną stronę niż „opadanie”
  return { x: sxx > 1e-6 ? deg(sxc / sxx) : 0, z: szz > 1e-6 ? deg(szc / szz) : 0 };
}

/** Wypadkowy przechył formy (stopnie). Dodatni x – prawa strona wyżej; dodatni z – przód wyżej. */
export function tiltOf(s: LiftState, swing = { x: 0, z: 0 }, bal?: LiftBalance): { x: number; z: number; mag: number } {
  const c = chainTilt(s); const k = bal?.swingCoupling ?? 0;
  const x = s.drift.x + c.x + swing.x * 180 / Math.PI * k, z = s.drift.z + c.z + swing.z * 180 / Math.PI * k;
  return { x, z, mag: Math.hypot(x, z) };
}

export interface LiftStep { dLift: number; adjust: -1 | 0 | 1; swing: { x: number; z: number } }

/** Krok symulacji. Zwraca zdarzenie, gdy coś się stało. */
export function stepLift(s: LiftState, dt: number, inp: LiftStep, bal: LiftBalance): 'cracked' | 'out' | null {
  if (s.cracked || !s.inModel) {
    if (inp.adjust) s.chains[s.sel] = clamp(s.chains[s.sel] + inp.adjust * bal.chainRate * dt, -.08, .08);
    return null;
  }
  if (inp.adjust) s.chains[s.sel] = clamp(s.chains[s.sel] + inp.adjust * bal.chainRate * dt, -.08, .08);
  const up = Math.max(0, inp.dLift);
  if (up > 0) {
    // forma ucieka w przechył proporcjonalnie do drogi wyciągania (szybkie szarpnięcie = duży skok)
    s.drift.x += s.imb.x * bal.driftDegPerM * up;
    s.drift.z += s.imb.z * bal.driftDegPerM * up;
    s.lifted += up;
  }
  const t = tiltOf(s, inp.swing, bal);
  s.maxTilt = Math.max(s.maxTilt, t.mag);
  if (t.mag > bal.crackDeg) { s.cracked = true; s.penalty += bal.crackPenalty; return 'cracked'; }
  if (t.mag > bal.warnDeg) s.penalty += (t.mag - bal.warnDeg) * bal.penaltyPerDegSec * dt;
  if (s.lifted >= s.depth) { s.inModel = false; return 'out'; }
  return null;
}

/** Punkty za wyjęcie formy (bez pęknięcia): nagroda minus kara za przechył. */
export function extractScore(s: LiftState, bal: LiftBalance): number {
  return s.cracked ? -bal.crackPenalty : Math.round(bal.extractPoints - s.penalty);
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
