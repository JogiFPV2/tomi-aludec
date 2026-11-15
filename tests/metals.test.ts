import { describe, it, expect } from 'vitest';
import { needFor, countBy, fillBox, moveItem, setsIn, seeded } from '../src/game/metals/box';
import { MODELS_DB } from '../src/data/models';
import { METALS } from '../src/data/metals';
import { PourSim } from '../src/game/pour/pourSim';
import { DEFAULT_BALANCE } from '../src/core/balance';

const def = MODELS_DB[0];
describe('skrzynia z metalami', () => {
  it('90% sztuk pasuje do modelu, 10% to inne metale', () => {
    const items = fillBox(def, METALS, { boxSize: 30, otherShare: .1 }, seeded(5));
    const need = Object.keys(needFor(def));
    expect(items).toHaveLength(30);
    expect(items.filter(id => !need.includes(id))).toHaveLength(3);
    const c = countBy(items); for (const id of need) expect(c[id]).toBeGreaterThan(5);
  });
  it('kolejność zależy od ziarna, ale skład nie', () => {
    const a = fillBox(def, METALS, { boxSize: 20, otherShare: .1 }, seeded(1)), b = fillBox(def, METALS, { boxSize: 20, otherShare: .1 }, seeded(2));
    expect(a.join()).not.toBe(b.join()); expect(a.filter(i => i === 'M-114').length).toBe(b.filter(i => i === 'M-114').length);
  });
  it('przekładanie pilnuje pojemności palety', () => {
    const box = ['M-114', 'U-020'], pal: string[] = [];
    expect(moveItem(box, pal, 1, 1)).toBe(true); expect(pal).toEqual(['U-020']);
    expect(moveItem(box, pal, 0, 1)).toBe(false); expect(box).toEqual(['M-114']);
    expect(moveItem(box, pal, 5)).toBe(false);
  });
  it('liczy komplety na formę', () => {
    const need = needFor(def);
    expect(setsIn(['M-114', 'M-114', 'U-020', 'U-020', 'U-020'], need)).toBe(1);
    expect(setsIn(['M-114', 'U-020'], need)).toBe(0);
  });
});

describe('metale w modelu przy sypaniu', () => {
  const bal = DEFAULT_BALANCE.pour;
  it('pusty model: brak metalu i zły metal kosztują punkty, dobry nie', () => {
    const s = new PourSim(def, bal, 'none');
    expect(s.metals.every(m => m.placed === null)).toBe(true);
    expect(s.placeMetal(0, def.metals[0].metalId)).toBe(true);
    const wrong = METALS.find(m => m.id !== def.metals[1].metalId)!.id;
    s.placeMetal(1, wrong);
    const r = s.finish();
    expect(r.breakdown.filter(b => b.label.startsWith('Brak metalu'))).toHaveLength(def.metals.length - 2);
    expect(r.breakdown.filter(b => b.label.startsWith('Zły metal'))).toHaveLength(1);
    expect(r.breakdown.find(b => b.label.startsWith('Brak metalu'))!.pts).toBe(-bal.missingMetalPenalty);
  });
  it('po Starcie nie da się już układać metali, a pustego miejsca nie da się podbić', () => {
    const s = new PourSim(def, bal, 'none'); s.start();
    expect(s.placeMetal(0, def.metals[0].metalId)).toBe(false);
    expect(s.tapMetal(0).ok).toBe(false);
  });
});
