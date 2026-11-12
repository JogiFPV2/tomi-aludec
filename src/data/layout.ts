/**
 * Układ firmy – czyste dane (metry). Pomieszczenia, ściany, stanowiska i wyposażenie.
 * Oś x – w prawo, oś z – „w dół ekranu” (do kamery). Ściany bliżej kamery są niskie (przekrój).
 */
export interface Room { id: string; name: string; x0: number; z0: number; x1: number; z1: number; floor: 'floor' | 'tiles' }
export interface Wall { x0: number; z0: number; x1: number; z1: number; low?: boolean }
export interface Station { id: string; name: string; x: number; z: number }
export interface ModelSpawn { id: string; name: string; x: number; z: number }

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
  { id: 'st1', name: 'Stanowisko sypacza 1', x: 8, z: 7 },
  { id: 'st2', name: 'Stanowisko sypacza 2', x: 18, z: 7 },
  { id: 'st3', name: 'Stanowisko sypacza 3', x: 28, z: 7 },
];

/** Modele czekające na palecie przy stanowisku 1 (do przeniesienia suwnicą). */
export const MODELS: ModelSpawn[] = [
  { id: 'kp180', name: 'Model KP-180', x: 8.5, z: 11.6 },
  { id: 'ob220', name: 'Model OB-220', x: 11.2, z: 11.6 },
];

export const COLUMNS: [number, number][] = [6, 12, 18, 24, 30].flatMap(x => [[x, .45], [x, 21.55]] as [number, number][]);
export const PALLETS: [number, number][] = [[3, 19], [4.6, 19], [24, 15.5], [33.5, 12], [33.5, 13.6], [15, 19.5]];
export const SPAWN = { x: -6, z: 21.5 };
export const CRANE_START = { x: 10, z: 11 };
