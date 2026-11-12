/**
 * Katalog metali (ochładzalników / metalek). Każdy ma numer, nazwę i wagę.
 * Docelowo dane przyjdą z panelu admina (baza), na razie leżą tutaj.
 */
export interface MetalDef {
  id: string;          // numer, np. M-114
  name: string;
  weightKg: number;
  /** wymiary w metrach (dł. x szer. x wys.) */
  size: [number, number, number];
  /** uniwersalny = pasuje do wielu modeli */
  universal: boolean;
}

export const METALS: MetalDef[] = [
  { id: 'M-114', name: 'Ochładzalnik płaski 114', weightKg: 2.4, size: [.13, .08, .1], universal: false },
  { id: 'M-131', name: 'Ochładzalnik kątowy 131', weightKg: 3.1, size: [.16, .09, .1], universal: false },
  { id: 'U-020', name: 'Uniwersalny 020', weightKg: 1.1, size: [.1, .07, .08], universal: true },
  { id: 'U-045', name: 'Uniwersalny 045', weightKg: 1.6, size: [.12, .07, .09], universal: true },
];

export const metalById = (id: string) => METALS.find(m => m.id === id);
