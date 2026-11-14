/**
 * Palety i stosy palet – czysta logika (bez grafiki), pokryta testami.
 * Paleta leży zawsze równolegle do osi hali; stos to kilka palet jedna na drugiej.
 */
export const PALLET = { w: 1.5, d: 1.2, h: .14 };

export interface Stack {
  id: string; x: number; z: number;
  /** ile palet w stosie */
  count: number;
  /** uniesienie spodu nad posadzką (stos na widłach paleciaka) */
  lift: number;
  /** paleta obrócona o 90° (dłuższy bok wzdłuż osi z) */
  rot?: boolean;
}

export interface TransportBalance {
  maxStack: number;          // ile palet maksymalnie w jednym stosie
  handMax: number;           // ile palet można nieść ręcznie
  handSpeed: number[];       // mnożnik prędkości chodzenia z 1, 2… paletami w rękach
  jackManualSpeed: number;   // m/s – paleciak ręczny
  jackElectricSpeed: number; // m/s – paleciak elektryczny
  jackLift: number;          // m – o ile widły unoszą stos
  jackTurn: number;          // rad/s – jak szybko paleciak skręca
}

/** Wysokość wierzchu stosu nad posadzką. */
export const topOf = (s: Stack) => s.lift + s.count * PALLET.h;

/** Wymiary palety w osiach hali (z uwzględnieniem obrotu). */
export const sizeOf = (rot?: boolean) => rot ? { w: PALLET.d, d: PALLET.w } : { w: PALLET.w, d: PALLET.d };

/** Czy punkt leży nad stosem. */
export const covers = (s: Stack, x: number, z: number, pad = 0) => { const q = sizeOf(s.rot); return Math.abs(x - s.x) <= q.w / 2 + pad && Math.abs(z - s.z) <= q.d / 2 + pad; };

/** Najwyższy stos pod punktem (albo null). */
export function stackAt(stacks: Stack[], x: number, z: number): Stack | null {
  let best: Stack | null = null;
  for (const s of stacks) if (covers(s, x, z) && (!best || topOf(s) > topOf(best))) best = s;
  return best;
}

/** Najbliższy stos w zasięgu (odległość do środka). */
export function nearestStack(stacks: Stack[], x: number, z: number, maxD: number, skip?: Stack | null): Stack | null {
  let best: Stack | null = null, bd = maxD;
  for (const s of stacks) { if (s === skip) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}

export type Place = { kind: 'floor' } | { kind: 'merge'; target: Stack } | { kind: 'blocked'; reason: 'overlap' | 'full' | 'occupied' };

/**
 * Co się stanie, gdy odłożymy `count` palet w punkcie (x, z):
 * – środek blisko środka innego stosu → dokładamy na ten stos (o ile nie jest pełny i nic na nim nie stoi);
 *   dokładane palety układają się tak jak stos (obrót stosu),
 * – zahacza o inny stos → nie da się,
 * – wolne miejsce → na posadzkę.
 */
export function placeAt(stacks: Stack[], x: number, z: number, count: number, bal: Pick<TransportBalance, 'maxStack'>, occupied: (s: Stack) => boolean, skip?: Stack | null, rot?: boolean): Place {
  const a = sizeOf(rot);
  for (const s of stacks) {
    if (s === skip) continue;
    const q = sizeOf(s.rot); const dx = Math.abs(s.x - x), dz = Math.abs(s.z - z);
    if (dx >= (a.w + q.w) / 2 || dz >= (a.d + q.d) / 2) continue;
    if (dx < .5 && dz < .45) {
      if (occupied(s)) return { kind: 'blocked', reason: 'occupied' };
      if (s.count + count > bal.maxStack) return { kind: 'blocked', reason: 'full' };
      return { kind: 'merge', target: s };
    }
    return { kind: 'blocked', reason: 'overlap' };
  }
  return { kind: 'floor' };
}

/** Zdejmuje do `n` palet z wierzchu stosu; zwraca, ile zdjęto. */
export function takeTop(s: Stack, n: number): number { const k = Math.max(0, Math.min(n, s.count)); s.count -= k; return k; }

/** Obrót kąta w stronę celu z ograniczoną prędkością. */
export function turnToward(a: number, target: number, maxStep: number): number {
  let d = target - a; d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.max(-maxStep, Math.min(maxStep, d));
}
