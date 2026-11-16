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

/** Wymiary hali (m). Północna nawa (z od 0 do CRANE_BAY_D) ma suwnice; południowa to transport, magazyn i malarnia rdzeni. */
export const HALL = { w: 84, d: 48 };
export const CRANE_BAY_D = 24;

export const ROOMS: Room[] = [
  { id: 'hala', name: 'Hala formierni', x0: 0, z0: 0, x1: HALL.w, z1: HALL.d, floor: 'floor' },
  { id: 'korytarz', name: 'Korytarz', x0: -10, z0: 13, x1: 0, z1: 17, floor: 'tiles' },
  { id: 'szatnia', name: 'Szatnia', x0: -10, z0: 17, x1: -2, z1: 25, floor: 'tiles' },
];

export const WALLS: Wall[] = [
  // hala
  { x0: 0, z0: 0, x1: HALL.w, z1: 0 }, { x0: HALL.w, z0: 0, x1: HALL.w, z1: HALL.d },
  { x0: 0, z0: 0, x1: 0, z1: 14 }, { x0: 0, z0: 16, x1: 0, z1: 17 }, { x0: 0, z0: 25, x1: 0, z1: HALL.d },
  { x0: 0, z0: HALL.d, x1: HALL.w, z1: HALL.d, low: true },
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
  { id: 'st1', name: 'Stanowisko sypacza 1', x: 12, z: 7, color: '#ff7a1a', colorName: 'pomarańczowa', bay: [3, 22] },
  { id: 'st2', name: 'Stanowisko sypacza 2', x: 32, z: 7, color: '#2d8cff', colorName: 'niebieska', bay: [22, 42] },
  { id: 'st3', name: 'Stanowisko sypacza 3', x: 52, z: 7, color: '#37c45a', colorName: 'zielona', bay: [42, 62] },
];

/** Modele czekające na paletach (do przeniesienia suwnicą na stanowisko). */
const spawn = (st: Station, kinds: string[]): ModelSpawn[] => kinds.map((k, i) => ({ id: `${k}-${st.id}-${i + 1}`, modelId: k, name: `Model ${k === 'kp180' ? 'KP-180' : 'OB-220'} (${st.name.slice(-1)}/${i + 1})`, x: st.x - 3.3 + i * 2.2, z: 11.6 }));
export const MODELS: ModelSpawn[] = [
  ...spawn(STATIONS[0], ['kp180', 'kp180', 'ob220', 'ob220']),
  ...spawn(STATIONS[1], ['kp180', 'ob220', 'kp180']),
  ...spawn(STATIONS[2], ['kp180', 'ob220', 'ob220']),
];

/** Słupy: pod północną ścianą, rząd pod torem suwnic (koniec nawy suwnic) i pod południową ścianą. */
export const COLUMNS: [number, number][] = [
  ...[6, 18, 30, 42, 54, 66, 78].flatMap(x => [[x, .45], [x, HALL.d - .45]] as [number, number][]),
  ...[2, 12, 22, 32, 42, 52, 62].map(x => [x, CRANE_BAY_D] as [number, number]),
];
/** Palety na hali (stosy). Przy każdym stanowisku leży tylko jedna paleta na formę – resztę trzeba znaleźć i przynieść. */
export const PALLET_STACKS: { x: number; z: number; count: number }[] = [
  ...STATIONS.map(st => ({ x: st.x + FORM_PALLETS_OFF[0].x, z: FORM_PALLETS_OFF[0].z, count: 1 })),
  { x: 4, z: 28, count: 5 }, { x: 6, z: 28, count: 3 }, { x: 4, z: 19.5, count: 2 }, { x: 28, z: 30, count: 4 }, { x: 40, z: 27, count: 2 }, { x: 60, z: 19, count: 2 },
  { x: 16, z: 41, count: 4 }, { x: 36, z: 43, count: 3 }, { x: 70, z: 30, count: 2 }, { x: 24, z: 20.5, count: 1 }, { x: 46, z: 20.5, count: 1 },
];
/** Paleciaki na hali: ręczne i elektryczne (różnią się prędkością). */
export interface JackSpawn { id: string; kind: 'manual' | 'electric'; x: number; z: number; heading: number }
export const JACKS: JackSpawn[] = [
  { id: 'pr1', kind: 'manual', x: 2.4, z: 21, heading: 0 },
  { id: 'pr2', kind: 'manual', x: 34, z: 26.5, heading: Math.PI / 2 },
  { id: 'pe1', kind: 'electric', x: 8, z: 33, heading: -Math.PI / 2 },
  { id: 'pe2', kind: 'electric', x: 60, z: 28, heading: Math.PI },
];
/** Skrzynie z metalami – każda do jednego modelu. */
export const METAL_BOXES: { id: string; modelId: string; x: number; z: number }[] = [
  { id: 'box-kp180', modelId: 'kp180', x: 21, z: 17.5 },
  { id: 'box-ob220', modelId: 'ob220', x: 23.4, z: 17.5 },
];
/** Kadź z ciekłym aluminium (źródło żaru i iskier). */
export const LADLE = { x: 73, z: 9 };
/** Malarnia rdzeni: strefa, w której maluje się i wypala formy stojące na paletach. */
export const PAINT = { name: 'Malarnia rdzeni', x0: 44, z0: 30, x1: 60, z1: 42, spots: [[47, 33.5], [50.5, 33.5], [54, 33.5], [47, 38.5], [50.5, 38.5], [54, 38.5]] as [number, number][], stand: { x: 58, z: 32 } };
export const inPaintZone = (x: number, z: number) => x >= PAINT.x0 && x <= PAINT.x1 && z >= PAINT.z0 && z <= PAINT.z1;
export const SPAWN = { x: -6, z: 21.5 };
export const CRANE_START_Z = 10;
