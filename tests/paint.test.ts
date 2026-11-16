import { describe, it, expect } from 'vitest';
import { createPaint, brush, coverage, ignite, stepPaint, paintScore } from '../src/game/paint/paint';

const bal = { minCover: .92, burnSec: 18, drySec: 150, points: 80, brushR: .07 };
const paintAll = (p = createPaint()) => { for (let v = 0; v <= 1.001; v += .04) for (let u = 0; u <= 1.001; u += .04) brush(p, u, v, bal); return p; };

describe('malowanie rdzeni', () => {
  it('pędzel maluje tylko raz to samo miejsce i zaczyna schnięcie', () => {
    const p = createPaint(); const n = brush(p, .5, .5, bal);
    expect(n).toBeGreaterThan(5); expect(brush(p, .5, .5, bal)).toBe(0);
    expect(p.state).toBe('wet'); expect(p.t).toBe(bal.drySec); expect(coverage(p)).toBeCloseTo(n / p.grid.length);
  });
  it('całą formę da się pomalować w 100%', () => { expect(coverage(paintAll())).toBe(1); });
  it('podpalona farba wypala się szybko, niepodpalona schnie długo', () => {
    const a = paintAll(), b = paintAll();
    expect(ignite(a, bal)).toBe(true); expect(ignite(a, bal)).toBe(false);
    expect(stepPaint(a, bal.burnSec - 1)).toBeNull(); expect(stepPaint(a, 1.1)).toBe('ready');
    expect(stepPaint(b, bal.burnSec + 5)).toBeNull(); expect(b.state).toBe('wet');
    expect(stepPaint(b, bal.drySec)).toBe('ready');
  });
  it('nie da się podpalić suchej formy ani malować płonącej / gotowej', () => {
    const p = createPaint(); expect(ignite(p, bal)).toBe(false);
    brush(p, .2, .2, bal); ignite(p, bal); expect(brush(p, .8, .8, bal)).toBe(0);
    stepPaint(p, 99); expect(p.state).toBe('ready'); expect(brush(p, .8, .8, bal)).toBe(0);
  });
  it('punkty: pełne od progu, mniej za niedomalowanie, nic poniżej połowy', () => {
    expect(paintScore(.95, bal)).toBe(80); expect(paintScore(.71, bal)).toBe(40); expect(paintScore(.4, bal)).toBe(0);
  });
});
