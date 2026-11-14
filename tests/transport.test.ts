import { describe, it, expect } from 'vitest';
import { PALLET, topOf, stackAt, nearestStack, placeAt, takeTop, turnToward, type Stack } from '../src/game/transport/stacking';

const st = (id: string, x: number, z: number, count = 1, lift = 0): Stack => ({ id, x, z, count, lift });
const bal = { maxStack: 5 };
const free = () => false;

describe('palety i stosy', () => {
  it('wierzch stosu rośnie z liczbą palet i uniesieniem', () => {
    expect(topOf(st('a', 0, 0, 1))).toBeCloseTo(PALLET.h);
    expect(topOf(st('a', 0, 0, 3, .08))).toBeCloseTo(3 * PALLET.h + .08);
  });
  it('stackAt zwraca najwyższy stos pod punktem', () => {
    const s = [st('a', 0, 0, 1), st('b', 5, 5, 3)];
    expect(stackAt(s, .7, .5)?.id).toBe('a');
    expect(stackAt(s, .8, 0)).toBeNull();
    expect(stackAt(s, 5, 5)?.id).toBe('b');
  });
  it('nearestStack pomija wskazany stos i trzyma zasięg', () => {
    const s = [st('a', 0, 0), st('b', 1, 0)];
    expect(nearestStack(s, .2, 0, 1.5)?.id).toBe('a');
    expect(nearestStack(s, .2, 0, 1.5, s[0])?.id).toBe('b');
    expect(nearestStack(s, 9, 9, 1.5)).toBeNull();
  });
  it('odkładanie: wolne miejsce, dokładanie na stos, zahaczenie, pełny stos, zajęty stos', () => {
    const s = [st('a', 0, 0, 2)];
    expect(placeAt(s, 3, 0, 1, bal, free).kind).toBe('floor');
    expect(placeAt(s, .2, .1, 1, bal, free)).toEqual({ kind: 'merge', target: s[0] });
    expect(placeAt(s, 1.1, 0, 1, bal, free)).toEqual({ kind: 'blocked', reason: 'overlap' });
    expect(placeAt(s, 0, 0, 4, bal, free)).toEqual({ kind: 'blocked', reason: 'full' });
    expect(placeAt(s, 0, 0, 1, bal, () => true)).toEqual({ kind: 'blocked', reason: 'occupied' });
    expect(placeAt(s, 0, 0, 1, bal, free, s[0]).kind).toBe('floor');
  });
  it('takeTop nie zdejmie więcej, niż jest', () => {
    const a = st('a', 0, 0, 2);
    expect(takeTop(a, 1)).toBe(1); expect(a.count).toBe(1);
    expect(takeTop(a, 5)).toBe(1); expect(a.count).toBe(0);
  });
  it('turnToward skręca krótszą drogą i nie przekracza kroku', () => {
    expect(turnToward(0, 1, .25)).toBeCloseTo(.25);
    expect(turnToward(3, -3, .1)).toBeCloseTo(3.1);
    expect(turnToward(0, .05, .25)).toBeCloseTo(.05);
  });
});
