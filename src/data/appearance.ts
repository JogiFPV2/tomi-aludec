/**
 * Opcje wyglądu postaci – czyste dane. Nowe fryzury, kolory itp. dodaje się tutaj
 * (a później w panelu admina), bez zmian w kodzie budującym postać.
 */
export interface Appearance {
  body: 'm' | 'k';
  height: number;      // cm 150–205
  build: number;       // 0 szczupła … 1 krępa
  shoulders: number;   // 0..1
  skin: string;        // kolor
  hairStyle: HairStyle;
  hairColor: string;
  beard: BeardStyle;
  eyeColor: string;
  eyeSize: number;     // 0..1
  eyeSpacing: number;  // 0..1
  noseSize: number;    // 0..1
  noseLength: number;  // 0..1
  earSize: number;     // 0..1
  mouthWidth: number;  // 0..1
  glasses: 'none' | 'korekcyjne' | 'ochronne';
  helmetColor: string;
}
export type HairStyle = 'lysy' | 'krotkie' | 'jeż' | 'dluzsze' | 'kucyk';
export type BeardStyle = 'brak' | 'zarost' | 'wasy' | 'krotka' | 'pelna';

export const SKIN_COLORS = ['#f2d0b6', '#e2b594', '#c89a7c', '#a87556', '#7d5236', '#5a3a26'];
export const HAIR_COLORS = ['#151313', '#3b2a20', '#6b4a2e', '#a07a4c', '#c9a46a', '#b8b3aa', '#a2482a'];
export const EYE_COLORS = ['#5a3a22', '#4c6f8f', '#5f7a46', '#8a8f93', '#2b2120'];
export const HELMET_COLORS = ['#e5b21a', '#eeeeea', '#d2462a', '#2f6fb0', '#3d9a52'];

export const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  { id: 'lysy', label: 'Łysy' }, { id: 'krotkie', label: 'Krótkie' }, { id: 'jeż', label: 'Jeżyk' },
  { id: 'dluzsze', label: 'Dłuższe' }, { id: 'kucyk', label: 'Kucyk' },
];
export const BEARD_STYLES: { id: BeardStyle; label: string }[] = [
  { id: 'brak', label: 'Gładko' }, { id: 'zarost', label: 'Zarost' }, { id: 'wasy', label: 'Wąsy' },
  { id: 'krotka', label: 'Krótka broda' }, { id: 'pelna', label: 'Pełna broda' },
];

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'm', height: 180, build: .5, shoulders: .5, skin: SKIN_COLORS[2], hairStyle: 'krotkie', hairColor: HAIR_COLORS[1],
  beard: 'brak', eyeColor: EYE_COLORS[1], eyeSize: .5, eyeSpacing: .5, noseSize: .5, noseLength: .5, earSize: .5, mouthWidth: .5,
  glasses: 'none', helmetColor: HELMET_COLORS[0],
};

/** Uzupełnia brakujące pola (np. po dodaniu nowych opcji) i przycina wartości do zakresu. */
export function normalizeAppearance(a: Partial<Appearance> | null | undefined): Appearance {
  const o = { ...DEFAULT_APPEARANCE, ...(a ?? {}) } as Appearance;
  const c = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : (lo + hi) / 2));
  o.height = c(o.height, 150, 205);
  for (const k of ['build', 'shoulders', 'eyeSize', 'eyeSpacing', 'noseSize', 'noseLength', 'earSize', 'mouthWidth'] as const) o[k] = c(o[k]);
  if (!HAIR_STYLES.some(h => h.id === o.hairStyle)) o.hairStyle = DEFAULT_APPEARANCE.hairStyle;
  if (!BEARD_STYLES.some(b => b.id === o.beard)) o.beard = 'brak';
  return o;
}

export function randomAppearance(rnd = Math.random): Appearance {
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const body = rnd() < .5 ? 'm' : 'k';
  return normalizeAppearance({
    body, height: body === 'm' ? 168 + rnd() * 26 : 155 + rnd() * 22, build: rnd(), shoulders: rnd(),
    skin: pick(SKIN_COLORS), hairStyle: pick(HAIR_STYLES).id, hairColor: pick(HAIR_COLORS),
    beard: body === 'm' ? pick(BEARD_STYLES).id : 'brak', eyeColor: pick(EYE_COLORS), eyeSize: rnd(), eyeSpacing: rnd(),
    noseSize: rnd(), noseLength: rnd(), earSize: rnd(), mouthWidth: rnd(), glasses: rnd() < .25 ? 'korekcyjne' : 'none', helmetColor: pick(HELMET_COLORS),
  });
}
