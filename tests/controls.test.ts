import { describe, it, expect } from 'vitest';
import { shapeStick, expoFor, approach } from '../src/game/input/stick';
import { sanitize, DEFAULTS } from '../src/core/settings';

describe('gałka', () => {
  it('martwa strefa: drobne drgnięcie kciuka nic nie robi', () => {
    expect(shapeStick(.1, .05, .18, 1.8)).toEqual({ x: 0, y: 0 });
  });
  it('pełne wychylenie daje pełną prędkość, kierunek zostaje', () => {
    const s = shapeStick(.6, .8, .18, 1.8);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(1);
    expect(s.x / s.y).toBeCloseTo(.75);
  });
  it('połowa wychylenia daje wyraźnie mniej niż połowę prędkości', () => {
    const s = shapeStick(.5, 0, .18, 1.8);
    expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(.3);
  });
  it('mniejsza czułość = większy wykładnik', () => {
    expect(expoFor(.5)).toBeGreaterThan(expoFor(1)); expect(expoFor(1.5)).toBeCloseTo(1);
  });
  it('approach nie przeskakuje celu', () => {
    expect(approach(0, 1, .3)).toBeCloseTo(.3); expect(approach(.9, 1, .3)).toBe(1); expect(approach(1, 0, .3)).toBeCloseTo(.7);
  });
});
describe('ustawienia', () => {
  it('przycina do zakresów i ignoruje śmieci', () => {
    const s = sanitize({ camTilt: 45, moveSens: -3, uiScale: 'x', leftHanded: true, grain: 'tak' });
    expect(s.camTilt).toBe(20); expect(s.moveSens).toBe(.5); expect(s.uiScale).toBe(DEFAULTS.uiScale); expect(s.leftHanded).toBe(true); expect(s.grain).toBe(DEFAULTS.grain);
    expect(sanitize(null)).toEqual(DEFAULTS);
  });
});
