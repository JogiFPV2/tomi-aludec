/**
 * Fizyka suwnicy – czysta logika bez grafiki (łatwa do testowania).
 *
 * Model: wózek suwnicy jeździ w poziomie (x, z), z wózka zwisa lina o długości L do haka.
 * Hak z ładunkiem to wahadło. Gdy wózek przyspiesza lub hamuje, ładunek zaczyna się bujać:
 *   θ'' = −(g/L)·sin θ − (a/L)·cos θ − c·θ'
 * Na biegu 2 (szybkim) zmiany prędkości są większe, więc i bujanie jest większe.
 * Gwałtowne, nierówne wciskanie klawiszy (start–stop, zmiana kierunku) też rozbujuje ładunek.
 */
import type { Balance } from '../../core/balance';

export const G = 9.81;

export interface CraneLoad {
  id: string;
  /** odległość od haka do dolnej krawędzi ładunku, gdy wisi */
  hang: number;
  /** czy ładunek stoi na podłożu (lina luźna) */
  resting: boolean;
  /** położenie dolnej krawędzi ładunku (środek podstawy) */
  x: number; y: number; z: number;
}

export interface CraneState {
  x: number; z: number;          // położenie wózka (nad hakiem)
  vx: number; vz: number;        // prędkość wózka
  ax: number; az: number;        // ostatnie przyspieszenie wózka
  hookY: number;                 // wysokość haka nad podłogą (gdy lina pionowa)
  ropeTop: number;               // wysokość wózka (górny punkt liny)
  thX: number; thZ: number;      // kąt wychylenia liny (rad)
  wX: number; wZ: number;        // prędkość kątowa
  gear: 1 | 2;
  load: CraneLoad | null;
  limits: { x: [number, number]; z: [number, number]; y: [number, number] };
}

export interface CraneInput { mx: number; mz: number; hoist: number }

export type SupportFn = (x: number, z: number) => number;

export function createCrane(x: number, z: number, opts?: Partial<CraneState>): CraneState {
  return {
    x, z, vx: 0, vz: 0, ax: 0, az: 0, hookY: 3, ropeTop: 8.2, thX: 0, thZ: 0, wX: 0, wZ: 0, gear: 1, load: null,
    limits: { x: [1.5, 34.5], z: [1.2, 20.8], y: [0.35, 6] }, ...opts,
  };
}

/** Położenie haka z uwzględnieniem bujania. */
export function hookPosition(s: CraneState): { x: number; y: number; z: number } {
  const L = Math.max(0.2, s.ropeTop - s.hookY);
  return { x: s.x + Math.sin(s.thX) * L, y: s.ropeTop - L * Math.cos(s.thX) * Math.cos(s.thZ), z: s.z + Math.sin(s.thZ) * L };
}

/** Wychylenie haka/ładunku w metrach – miara „jak bardzo się buja”. */
export function swingAmplitude(s: CraneState): number {
  const L = Math.max(0.2, s.ropeTop - s.hookY);
  return Math.hypot(Math.sin(s.thX), Math.sin(s.thZ)) * L;
}

const approach = (v: number, target: number, maxStep: number) => v + Math.max(-maxStep, Math.min(maxStep, target - v));

export function stepCrane(s: CraneState, input: CraneInput, dt: number, bal: Balance['crane'], support: SupportFn): void {
  const speed = s.gear === 1 ? bal.slowSpeed : bal.fastSpeed;
  const hoistSpeed = s.gear === 1 ? bal.hoistSlow : bal.hoistFast;
  // bieg szybki ma też ostrzejsze ruszanie i hamowanie
  const accel = bal.accel * (s.gear === 1 ? 1 : 1.6);

  const len = Math.hypot(input.mx, input.mz);
  const nx = len > 1 ? input.mx / len : input.mx, nz = len > 1 ? input.mz / len : input.mz;
  const ovx = s.vx, ovz = s.vz;
  s.vx = approach(s.vx, nx * speed, accel * dt);
  s.vz = approach(s.vz, nz * speed, accel * dt);
  s.ax = dt > 0 ? (s.vx - ovx) / dt : 0;
  s.az = dt > 0 ? (s.vz - ovz) / dt : 0;

  // ruch wózka z ograniczeniem do toru
  const px = s.x, pz = s.z;
  s.x = Math.min(s.limits.x[1], Math.max(s.limits.x[0], s.x + s.vx * dt));
  s.z = Math.min(s.limits.z[1], Math.max(s.limits.z[0], s.z + s.vz * dt));
  if (s.x !== px + s.vx * dt) { s.ax = -s.vx / Math.max(dt, 1e-3); s.vx = 0; } // uderzenie w odbojnik
  if (s.z !== pz + s.vz * dt) { s.az = -s.vz / Math.max(dt, 1e-3); s.vz = 0; }

  // podnoszenie / opuszczanie
  let hy = s.hookY + input.hoist * hoistSpeed * dt;
  const ld = s.load;
  if (ld) {
    // ładunek nie może zejść poniżej podłoża
    const minHook = support(ld.x, ld.z) + ld.hang;
    if (hy <= minHook) {
      hy = Math.max(hy, minHook - 0.25); // lina może się trochę poluzować
    }
  } else {
    const h = hookPosition(s);
    hy = Math.max(hy, support(h.x, h.z) + 0.3);
  }
  s.hookY = Math.min(s.limits.y[1], Math.max(s.limits.y[0], hy));

  // wahadło
  const L = Math.max(0.3, s.ropeTop - s.hookY);
  const loaded = !!ld && !ld.resting;
  const k = loaded ? 1 : 0.85; // pusty hak buja się trochę lżej
  const c = 2 * bal.swingDamping * Math.sqrt(G / L) * (loaded ? 1 : 1.4);
  const sub = 4, h = dt / sub;
  for (let i = 0; i < sub; i++) {
    const aX = -(G / L) * Math.sin(s.thX) - k * (s.ax / L) * Math.cos(s.thX) - c * s.wX;
    const aZ = -(G / L) * Math.sin(s.thZ) - k * (s.az / L) * Math.cos(s.thZ) - c * s.wZ;
    s.wX += aX * h; s.wZ += aZ * h;
    s.thX += s.wX * h; s.thZ += s.wZ * h;
  }
  s.thX = Math.max(-0.9, Math.min(0.9, s.thX));
  s.thZ = Math.max(-0.9, Math.min(0.9, s.thZ));

  // ładunek
  if (ld) {
    const hp = hookPosition(s);
    const bottom = hp.y - ld.hang;
    const sup = support(hp.x, hp.z);
    if (bottom <= sup + 1e-3) {
      // stoi – lina luźna, bujanie szybko gaśnie, ładunek nie przesuwa się po podłożu
      ld.resting = true; ld.y = sup;
      s.wX *= 0.6; s.wZ *= 0.6; s.thX *= 0.85; s.thZ *= 0.85;
    } else {
      ld.resting = false;
      ld.x = hp.x; ld.z = hp.z; ld.y = bottom;
    }
  }
}

/** Czy hak jest na tyle blisko punktu zaczepienia, żeby zaczepić ładunek. */
export function canAttach(s: CraneState, lug: { x: number; y: number; z: number }): boolean {
  const hp = hookPosition(s);
  const dy = hp.y - lug.y;
  return Math.hypot(hp.x - lug.x, hp.z - lug.z) < 0.45 && dy > -0.05 && dy < 0.7;
}
