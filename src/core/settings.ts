/**
 * Ustawienia gracza (zapisywane w przeglądarce): kamera, czułość sterowania, wygląd interfejsu.
 * Moduły czytają `settings.v` i mogą nasłuchiwać zmian.
 */
export interface Settings {
  camTilt: number;      // pochylenie kamery od pionu, 12–20°
  moveSens: number;     // czułość gałki chodzenia, 0,5–1,5
  armSens: number;      // czułość ramienia mieszarki, 0,4–1,4
  uiScale: number;      // wielkość przycisków i napisów, 0,85–1,3
  leftHanded: boolean;  // gałka po prawej, akcje po lewej
  grain: boolean;       // papierowe ziarno na obrazie
  labels: boolean;      // napisy nad miejscami na hali
}
export const DEFAULTS: Settings = { camTilt: 16, moveSens: .8, armSens: .7, uiScale: 1, leftHanded: false, grain: true, labels: true };
export const LIMITS = { camTilt: [12, 20], moveSens: [.5, 1.5], armSens: [.4, 1.4], uiScale: [.85, 1.3] } as const;
const KEY = 'tomi.ustawienia';

/** Wczytane wartości przycina do dozwolonych zakresów (stare lub zepsute zapisy nie psują gry). */
export function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>; const out = { ...DEFAULTS };
  for (const k of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) { const v = r[k]; if (typeof v === 'number' && isFinite(v)) out[k] = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], v)); }
  for (const k of ['leftHanded', 'grain', 'labels'] as const) if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
  return out;
}

class Store {
  v: Settings = DEFAULTS;
  private subs = new Set<(s: Settings) => void>();
  constructor() { try { this.v = sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { this.v = { ...DEFAULTS }; } }
  set(patch: Partial<Settings>) {
    this.v = sanitize({ ...this.v, ...patch });
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch { /* tryb prywatny – zostaje do końca sesji */ }
    this.subs.forEach(f => f(this.v));
  }
  reset() { this.set({ ...DEFAULTS }); }
  /** Nasłuch zmian; od razu wywołuje z bieżącymi wartościami. Zwraca funkcję wyłączającą. */
  watch(fn: (s: Settings) => void): () => void { this.subs.add(fn); fn(this.v); return () => this.subs.delete(fn); }
}
export const settings = new Store();
