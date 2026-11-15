import type { ModelDef } from '../../data/models';
import type { MetalDef } from '../../data/metals';

/**
 * Skrzynie z metalami – czysta logika (testy). Skrzynia jest przypisana do modelu:
 * większość sztuk to metale potrzebne do tego modelu, reszta to „obce” metale, o które łatwo się pomylić.
 */
export interface MetalsBalance {
  boxSize: number;      // ile sztuk w pełnej skrzyni
  otherShare: number;   // jaka część to metale do innych modeli (0,1 = 10%)
  palletCap: number;    // ile sztuk mieści paleta
  refillBelow: number;  // poniżej ilu sztuk wózkowy dowozi metale
  reach: number;        // m – jak blisko skrzyni musi stać paleta
  stationReach: number; // m – jak blisko modelu musi stać paleta z metalami przy sypaniu
}

/** Ile sztuk którego metalu trzeba na jedną formę. */
export function needFor(def: ModelDef): Record<string, number> {
  const n: Record<string, number> = {}; for (const m of def.metals) n[m.metalId] = (n[m.metalId] ?? 0) + 1; return n;
}

export function countBy(items: string[]): Record<string, number> {
  const n: Record<string, number> = {}; for (const id of items) n[id] = (n[id] ?? 0) + 1; return n;
}

/** Zawartość skrzyni: (1 − otherShare) sztuk w proporcjach potrzeb modelu, reszta z innych metali; kolejność wymieszana. */
export function fillBox(def: ModelDef, all: MetalDef[], bal: Pick<MetalsBalance, 'boxSize' | 'otherShare'>, rnd: () => number): string[] {
  const need = def.metals.map(m => m.metalId);
  const others = all.map(m => m.id).filter(id => !need.includes(id));
  const nOther = others.length ? Math.round(bal.boxSize * bal.otherShare) : 0;
  const items: string[] = [];
  for (let i = 0; i < bal.boxSize - nOther; i++) items.push(need[i % need.length]);
  for (let i = 0; i < nOther; i++) items.push(others[Math.floor(rnd() * others.length)]);
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  return items;
}

/** Przekłada sztukę o indeksie `i` z `from` do `to` (z limitem pojemności). */
export function moveItem(from: string[], to: string[], i: number, cap = Infinity): boolean {
  if (i < 0 || i >= from.length || to.length >= cap) return false;
  to.push(from.splice(i, 1)[0]); return true;
}

/** Ile pełnych kompletów na formę jest w zestawie sztuk. */
export function setsIn(items: string[], need: Record<string, number>): number {
  const have = countBy(items); let n = Infinity;
  for (const id in need) n = Math.min(n, Math.floor((have[id] ?? 0) / need[id]));
  return isFinite(n) ? n : 0;
}

export const seeded = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647;
