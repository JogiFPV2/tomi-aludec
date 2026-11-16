/**
 * Malowanie rdzeni (form) siwą farbą – czysta logika (testy).
 * Malarz pokrywa wierzch formy farbą, potem może ją podpalić: farba wypala się szybko.
 * Bez podpalenia schnie sama, ale dużo dłużej. Gdy wyschnie / ogień zgaśnie, forma jest gotowa.
 */
export interface PaintBalance {
  minCover: number;   // jaka część powierzchni musi być pomalowana na pełne punkty
  burnSec: number;    // ile trwa wypalanie po podpaleniu
  drySec: number;     // ile schnie bez podpalenia
  points: number;     // punkty za dobrze pomalowany rdzeń
  brushR: number;     // promień pędzla (część szerokości formy)
}
export type PaintState = 'raw' | 'wet' | 'burning' | 'ready';
export interface CorePaint { nx: number; nz: number; grid: Uint8Array; painted: number; state: PaintState; /** sekundy do końca schnięcia / wypalania */ t: number; /** rośnie przy każdej zmianie rysunku (odświeżanie tekstury) */ rev: number }

export function createPaint(nx = 40, nz = 28): CorePaint { return { nx, nz, grid: new Uint8Array(nx * nz), painted: 0, state: 'raw', t: 0, rev: 0 }; }
export const coverage = (p: CorePaint) => p.painted / p.grid.length;

/** Pociągnięcie pędzlem w punkcie (u, v) z zakresu 0–1. Zwraca liczbę nowo pomalowanych pól. */
export function brush(p: CorePaint, u: number, v: number, bal: Pick<PaintBalance, 'brushR' | 'drySec'>): number {
  if (p.state === 'burning' || p.state === 'ready') return 0;
  const r = bal.brushR * p.nx, cx = u * p.nx, cz = v * p.nz; let n = 0;
  for (let j = Math.max(0, Math.floor(cz - r)); j <= Math.min(p.nz - 1, Math.ceil(cz + r)); j++) for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(p.nx - 1, Math.ceil(cx + r)); i++) {
    if (Math.hypot(i + .5 - cx, j + .5 - cz) > r) continue; const c = j * p.nx + i; if (!p.grid[c]) { p.grid[c] = 1; n++; }
  }
  if (n) { p.painted += n; p.rev++; p.state = 'wet'; p.t = bal.drySec; } // świeża farba – schnięcie liczy się od nowa
  return n;
}
/** Podpalenie świeżej farby. */
export function ignite(p: CorePaint, bal: Pick<PaintBalance, 'burnSec'>): boolean {
  if (p.state !== 'wet') return false; p.state = 'burning'; p.t = bal.burnSec; return true;
}
/** Upływ czasu; zwraca 'ready' w chwili, gdy farba wyschła albo ogień zgasł. */
export function stepPaint(p: CorePaint, dt: number): 'ready' | null {
  if (p.state !== 'wet' && p.state !== 'burning') return null;
  p.t -= dt; if (p.t > 0) return null; p.t = 0; p.state = 'ready'; return 'ready';
}
/** Punkty za pomalowanie: pełne od minCover w górę, poniżej proporcjonalnie mniej, poniżej połowy – nic. */
export function paintScore(cover: number, bal: Pick<PaintBalance, 'minCover' | 'points'>): number {
  if (cover >= bal.minCover) return bal.points;
  return Math.round(bal.points * Math.max(0, (cover - .5) / (bal.minCover - .5)));
}
