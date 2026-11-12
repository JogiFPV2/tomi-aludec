/**
 * Katalog modeli. Każdy model ma numer, nazwę, wymiary wnętrza, kształt odlewu,
 * miejsca na metale (z liczbą podbić) i miejsca na haki.
 * Docelowo dodawane w panelu admina – kod gry czyta tylko te dane.
 */
export type PatternPart =
  | { kind: 'halfCyl'; x: number; z: number; r: number; len: number; axis: 'x' | 'z'; color: 'red' | 'core' }
  | { kind: 'cyl'; x: number; z: number; r: number; h: number; color: 'red' | 'core' }
  | { kind: 'box'; x: number; z: number; w: number; d: number; h: number; color: 'red' | 'core' };

export interface MetalSlot {
  slot: string;        // nazwa miejsca, np. „lewy przód”
  metalId: string;     // który metal ma tu leżeć
  x: number; z: number; // położenie we wnętrzu modelu (m, środek = 0,0)
  taps: number;        // ile podbić wymaga
}

export interface HookSlot { x: number; z: number }

export interface ModelDef {
  id: string;
  number: string;      // numer modelu, np. KP-180
  name: string;
  inner: { l: number; w: number; h: number }; // wnętrze skrzynki (m)
  parts: number;       // z ilu części się składa
  pattern: PatternPart[];
  metals: MetalSlot[];
  hooks: HookSlot[];
  /** okno wstawiania haków – wysokość masy (m) od..do */
  hookWindow: [number, number];
}

export const MODELS_DB: ModelDef[] = [
  {
    id: 'kp180', number: 'KP-180', name: 'Korpus pompy KP-180', inner: { l: 1.48, w: 1.08, h: .55 }, parts: 5,
    pattern: [
      { kind: 'halfCyl', x: 0, z: 0, r: .2, len: .78, axis: 'x', color: 'red' },
      { kind: 'halfCyl', x: .39, z: 0, r: .27, len: .05, axis: 'x', color: 'red' },
      { kind: 'halfCyl', x: -.39, z: 0, r: .27, len: .05, axis: 'x', color: 'red' },
      { kind: 'halfCyl', x: .55, z: 0, r: .11, len: .3, axis: 'x', color: 'core' },
      { kind: 'halfCyl', x: -.55, z: 0, r: .11, len: .3, axis: 'x', color: 'core' },
      { kind: 'cyl', x: .05, z: 0, r: .09, h: .3, color: 'red' },
    ],
    metals: [
      { slot: 'lewy tył', metalId: 'M-114', x: -.22, z: -.3, taps: 3 },
      { slot: 'prawy tył', metalId: 'M-114', x: .22, z: -.3, taps: 3 },
      { slot: 'lewy przód', metalId: 'U-020', x: -.22, z: .3, taps: 2 },
      { slot: 'prawy przód', metalId: 'U-020', x: .22, z: .3, taps: 2 },
    ],
    hooks: [{ x: -.5, z: 0 }, { x: .5, z: 0 }],
    hookWindow: [.28, .45],
  },
  {
    id: 'ob220', number: 'OB-220', name: 'Obudowa OB-220', inner: { l: 1.48, w: 1.08, h: .55 }, parts: 2,
    pattern: [
      { kind: 'box', x: 0, z: 0, w: .7, d: .5, h: .22, color: 'red' },
      { kind: 'cyl', x: -.2, z: 0, r: .12, h: .34, color: 'red' },
      { kind: 'cyl', x: .25, z: .05, r: .08, h: .3, color: 'core' },
    ],
    metals: [
      { slot: 'lewy', metalId: 'M-131', x: -.5, z: 0, taps: 3 },
      { slot: 'prawy', metalId: 'M-131', x: .5, z: 0, taps: 3 },
      { slot: 'przód', metalId: 'U-045', x: 0, z: .36, taps: 2 },
    ],
    hooks: [{ x: 0, z: -.36 }],
    hookWindow: [.3, .46],
  },
];

export const modelById = (id: string) => MODELS_DB.find(m => m.id === id);

/** Wysokość odlewu (wzoru) nad płytą w danym punkcie wnętrza. */
export function patternTop(def: ModelDef, x: number, z: number): number {
  let t = 0;
  for (const p of def.pattern) {
    if (p.kind === 'halfCyl') {
      const along = p.axis === 'x' ? x - p.x : z - p.z, across = p.axis === 'x' ? z - p.z : x - p.x;
      if (Math.abs(along) <= p.len / 2 && Math.abs(across) < p.r) t = Math.max(t, Math.sqrt(p.r * p.r - across * across));
    } else if (p.kind === 'cyl') {
      if (Math.hypot(x - p.x, z - p.z) < p.r) t = Math.max(t, p.h);
    } else if (Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2) t = Math.max(t, p.h);
  }
  return t;
}
