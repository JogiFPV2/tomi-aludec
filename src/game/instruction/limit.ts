/**
 * Limit podglądów instrukcji modelu (czysta logika, testy).
 * Każdy gracz ma na każdy model pulę darmowych podglądów; kolejne kosztują trochę punktów.
 * Admin może limit wyłączyć (limitEnabled = false) – wtedy instrukcja jest zawsze za darmo.
 */
export interface InstructionBalance { freeViewsPerModel: number; penaltyPerExtraView: number; limitEnabled: boolean }

/** Ile punktów kosztuje następny podgląd, gdy gracz ma już `viewsSoFar` podglądów tego modelu. */
export function viewCost(viewsSoFar: number, bal: InstructionBalance): number {
  if (!bal.limitEnabled) return 0;
  return viewsSoFar >= bal.freeViewsPerModel ? Math.max(0, bal.penaltyPerExtraView) : 0;
}
/** Ile darmowych podglądów zostało (null = bez limitu). */
export function freeLeft(viewsSoFar: number, bal: InstructionBalance): number | null {
  return bal.limitEnabled ? Math.max(0, bal.freeViewsPerModel - viewsSoFar) : null;
}
