/**
 * Układ firmy – czyste dane (metry). Pomieszczenia, ściany, stanowiska i wyposażenie.
 * Oś x – w prawo, oś z – „w dół ekranu” (do kamery). Ściany bliżej kamery są niskie (przekrój).
 */
export interface Room { id: string; name: string; x0: number; z0: number; x1: number; z1: number; floor: 'floor' | 'tiles' }
export interface Wall { x0: number; z0: number; x1: number; z1: number; low?: boolean }
export interface Station {
  id: string; name: string; x: number; z: number;
  /** kolor suwnicy i pilota tego stanowiska (obramówka) */
  color: string; colorName: string;
  /** zasięg jazdy suwnicy wzdłuż hali (x) */
  bay: [number, number];
}
export interface ModelSpawn { id: string; modelId: string; name: string; x: number; z: number }

/** Miejsca na modele na rolotoku stanowiska (przesunięcie w x od środka) – maks. 3 modele. */
export const SLOT_X = [-2, 0, 2];
/** Mieszarka względem środka stanowiska. */
export const MIXER_OFF = { x: -4.4, z: -2.2 };
/** Stojak z pilotem suwnicy względem środka stanowiska. */
export const REMOTE_OFF = { x: 3.9, z: -1.3 };
/** Palety na gotowe formy przy stanowisku (względem środka, z bezwzględne). */
export const FORM_PALLETS_OFF: { x: number; z: number }[] = [{ x: .4, z: 4.1 }, { x: 2.2, z: 4.1 }];

export const ROOMS: Room[] = [
  { id: 'hala', name: 'Hala formierni', x0: 0, z0: 0, x1: 36, z1: 22, floor: 'floor' },
  { id: 'korytarz', name: 'Korytarz', x0: -10, z0: 13, x1: 0, z1: 17, floor: 'tiles' },
  { id: 'szatnia', name: 'Szatnia', x0: -10, z0: 17, x1: -2, z1: 25, floor: 'tiles' },
];

export const WALLS: Wall[] = [
  // hala
  { x0: 0, z0: 0, x1: 36, z1: 0 }, { x0: 36, z0: 0, x1: 36, z1: 22 },
  { x0: 0, z0: 0, x1: 0, z1: 14 }, { x0: 0, z0: 16, x1: 0, z1: 22 },
  { x0: 0, z0: 22, x1: 36, z1: 22, low: true },
  // korytarz
  { x0: -10, z0: 13, x1: 0, z1: 13 }, { x0: -10, z0: 13, x1: -10, z1: 17 },
  { x0: -10, z0: 17, x1: -7, z1: 17, low: true }, { x0: -5, z0: 17, x1: -2, z1: 17, low: true }, { x0: -2, z0: 17, x1: 0, z1: 17, low: true },
  // szatnia
  { x0: -10, z0: 17, x1: -10, z1: 25 }, { x0: -2, z0: 17, x1: -2, z1: 25 }, { x0: -10, z0: 25, x1: -2, z1: 25, low: true },
];

export const DOORS = [
  { x: 0, z: 15, axis: 'z' as const, label: 'Wejście na halę formierni' },
  { x: -6, z: 17, axis: 'x' as const, label: '' },
];

export const STATIONS: Station[] = [
  { id: 'st1', name: 'Stanowisko sypacza 1', x: 8, z: 7, color: '#ff7a1a', colorName: 'pomarańczowa', bay: [3, 13] },
  { id: 'st2', name: 'Stanowisko sypacza 2', x: 18, z: 7, color: '#2d8cff', colorName: 'niebieska', bay: [13, 23] },
  { id: 'st3', name: 'Stanowisko sypacza 3', x: 28, z: 7, color: '#37c45a', colorName: 'zielona', bay: [23, 33] },
];

/** Modele czekające na paletach (do przeniesienia suwnicą na stanowisko). */
export const MODELS: ModelSpawn[] = [
  { id: 'kp180-1', modelId: 'kp180', name: 'Model KP-180 nr 1', x: 4.8, z: 11.6 },
  { id: 'kp180-2', modelId: 'kp180', name: 'Model KP-180 nr 2', x: 7, z: 11.6 },
  { id: 'ob220-1', modelId: 'ob220', name: 'Model OB-220 nr 1', x: 9.2, z: 11.6 },
  { id: 'ob220-2', modelId: 'ob220', name: 'Model OB-220 nr 2', x: 11.4, z: 11.6 },
  { id: 'kp180-3', modelId: 'kp180', name: 'Model KP-180 nr 3', x: 17.2, z: 11.6 },
  { id: 'ob220-3', modelId: 'ob220', name: 'Model OB-220 nr 3', x: 19.4, z: 11.6 },
  { id: 'kp180-4', modelId: 'kp180', name: 'Model KP-180 nr 4', x: 27.2, z: 11.6 },
  { id: 'ob220-4', modelId: 'ob220', name: 'Model OB-220 nr 4', x: 29.4, z: 11.6 },
];

export const COLUMNS: [number, number][] = [6, 12, 18, 24, 30].flatMap(x => [[x, .45], [x, 21.55]] as [number, number][]);
/** Palety na hali (stosy). Przy każdym stanowisku leży tylko jedna paleta na formę – resztę trzeba znaleźć i przynieść. */
export const PALLET_STACKS: { x: number; z: number; count: number }[] = [
  ...STATIONS.map(st => ({ x: st.x + FORM_PALLETS_OFF[0].x, z: FORM_PALLETS_OFF[0].z, count: 1 })),
  { x: 3, z: 19, count: 4 }, { x: 4.8, z: 19, count: 1 }, { x: 24, z: 15.5, count: 2 }, { x: 33.5, z: 12, count: 1 }, { x: 33.5, z: 13.6, count: 1 }, { x: 15, z: 19.5, count: 3 },
];
/** Paleciaki na hali: ręczne i elektryczne (różnią się prędkością). */
export interface JackSpawn { id: string; kind: 'manual' | 'electric'; x: number; z: number; heading: number }
export const JACKS: JackSpawn[] = [
  { id: 'pr1', kind: 'manual', x: 2.2, z: 16.4, heading: 0 },
  { id: 'pr2', kind: 'manual', x: 21.6, z: 13.4, heading: Math.PI / 2 },
  { id: 'pe1', kind: 'electric', x: 27.5, z: 20.3, heading: -Math.PI / 2 },
];
export const SPAWN = { x: -6, z: 21.5 };
export const CRANE_START_Z = 10;
