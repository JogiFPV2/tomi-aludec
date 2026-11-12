/**
 * Wartości balansu gry w JEDNYM miejscu.
 * Domyślne wartości są tutaj, a serwer (tabela `balance` w Supabase) może je nadpisać –
 * dzięki temu balans zmienia się bez ruszania kodu mechanik.
 */
export interface Balance {
  crane: {
    slowSpeed: number;   // m/s – bieg 1
    fastSpeed: number;   // m/s – bieg 2
    hoistSlow: number;   // m/s – podnoszenie na biegu 1
    hoistFast: number;   // m/s – podnoszenie na biegu 2
    accel: number;       // m/s² – jak szybko suwnica rusza i hamuje
    swingDamping: number;// tłumienie bujania (0..1, im mniej tym dłużej się buja)
    unlockPoints: number;// ile punktów potrzeba do odblokowania suwnicy
  };
  player: { walkSpeed: number; runSpeed: number };
  instructions: { freeViewsPerModel: number; penaltyPerExtraView: number };
  pour: { startDelaySec: number; maxPauseSec: number };
  /** wersja testowa: odblokuj wszystkie uprawnienia (np. suwnicę) */
  devUnlockAll: boolean;
}

export const DEFAULT_BALANCE: Balance = {
  crane: { slowSpeed: 0.35, fastSpeed: 1.1, hoistSlow: 0.12, hoistFast: 0.4, accel: 1.6, swingDamping: 0.06, unlockPoints: 500 },
  player: { walkSpeed: 2.2, runSpeed: 3.6 },
  instructions: { freeViewsPerModel: 20, penaltyPerExtraView: 5 },
  pour: { startDelaySec: 2, maxPauseSec: 15 },
  devUnlockAll: true,
};

/** Scala wartości z serwera z domyślnymi (brakujące pola zostają domyślne). */
export function mergeBalance(rows: { key: string; value: unknown }[]): Balance {
  const out: Balance = structuredClone(DEFAULT_BALANCE);
  for (const row of rows) {
    const k = row.key as keyof Balance;
    if (!(k in out) || typeof row.value !== 'object' || row.value === null) continue;
    Object.assign(out[k] as object, row.value as object);
  }
  return out;
}
