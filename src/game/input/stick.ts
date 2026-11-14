/**
 * Kształtowanie wychylenia gałki (czysta logika, testy): martwa strefa wokół środka
 * i krzywa, dzięki której małe ruchy kciuka dają mały ruch, a pełna prędkość jest dopiero przy krawędzi.
 */
export function shapeStick(x: number, y: number, deadzone: number, expo: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m <= deadzone || m === 0) return { x: 0, y: 0 };
  const k = Math.pow(Math.min(1, (m - deadzone) / (1 - deadzone)), expo) / m;
  return { x: x * k, y: y * k };
}

/** Czułość z ustawień (0,5 mała … 1,5 duża) → wykładnik krzywej (duży = spokojniejsza gałka). */
export const expoFor = (sens: number) => 1 + (1.5 - Math.max(.5, Math.min(1.5, sens))) * 1.3;

/** Zbliża wartość do celu nie szybciej niż `step`. */
export const approach = (v: number, target: number, step: number) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);
