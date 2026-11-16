import { describe, it, expect } from 'vitest';
import { viewCost, freeLeft } from '../src/game/instruction/limit';
import { shiftOf, clockParts } from '../src/core/clock';

describe('limit podglądów instrukcji', () => {
  const bal = { freeViewsPerModel: 20, penaltyPerExtraView: 5, limitEnabled: true };
  it('pierwsze 20 podglądów za darmo, 21. kosztuje', () => {
    expect(viewCost(0, bal)).toBe(0); expect(viewCost(19, bal)).toBe(0); expect(viewCost(20, bal)).toBe(5); expect(viewCost(99, bal)).toBe(5);
    expect(freeLeft(3, bal)).toBe(17); expect(freeLeft(25, bal)).toBe(0);
  });
  it('wyłączony limit: zawsze za darmo', () => {
    const off = { ...bal, limitEnabled: false };
    expect(viewCost(500, off)).toBe(0); expect(freeLeft(500, off)).toBeNull();
  });
});
describe('zegar i zmiany', () => {
  it('zmiany: I 6–14, II 14–22, III 22–6', () => {
    expect(shiftOf(6)).toBe('I'); expect(shiftOf(13)).toBe('I'); expect(shiftOf(14)).toBe('II'); expect(shiftOf(21)).toBe('II'); expect(shiftOf(22)).toBe('III'); expect(shiftOf(3)).toBe('III');
  });
  it('czas liczony w strefie Europe/Warsaw', () => {
    const p = clockParts(Date.UTC(2026, 10, 16, 10, 21)); // 11:21 w Warszawie (zima)
    expect(p.time).toBe('11:21'); expect(p.date).toContain('16.11.2026'); expect(p.shift).toBe('I');
  });
});
