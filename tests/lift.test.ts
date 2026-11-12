import { describe, it, expect } from 'vitest';
import { createLift, stepLift, tiltOf, chainTilt, imbalanceOf, extractScore } from '../src/game/crane/formLift';
import { DEFAULT_BALANCE } from '../src/core/balance';

const bal = DEFAULT_BALANCE.lift;
const hooks = [{ x: -.5, z: 0 }, { x: .5, z: 0 }];
const noSwing = { x: 0, z: 0 };

describe('wyciąganie formy z modelu', () => {
  it('skrócenie łańcucha po jednej stronie przechyla formę w tę stronę', () => {
    const s = createLift(hooks, { x: 0, z: 0 }, .6);
    s.chains[1] = .02; // prawy łańcuch krótszy
    expect(chainTilt(s).x).toBeGreaterThan(1);
    s.chains[1] = -.02;
    expect(chainTilt(s).x).toBeLessThan(-1);
  });

  it('bez korekty nierówna forma pęka przy wyciąganiu', () => {
    const s = createLift(hooks, { x: 1.2, z: 0 }, .6);
    let ev: string | null = null;
    for (let t = 0; t < 10 && !ev; t += 1 / 60) ev = stepLift(s, 1 / 60, { dLift: .12 / 60, adjust: 0, swing: noSwing }, bal);
    expect(ev).toBe('cracked'); expect(s.cracked).toBe(true);
    expect(extractScore(s, bal)).toBe(-bal.crackPenalty);
  });

  it('korygując łańcuchami da się wyjąć formę z niewielką karą', () => {
    const s = createLift(hooks, { x: 1.2, z: 0 }, .6);
    let ev: string | null = null;
    for (let t = 0; t < 20 && ev !== 'out'; t += 1 / 60) {
      const tilt = tiltOf(s, noSwing, bal).x;
      // gracz: prawa strona za wysoko → luzuje prawy łańcuch
      s.sel = 1; const adjust = tilt > .5 ? -1 : tilt < -.5 ? 1 : 0;
      ev = stepLift(s, 1 / 60, { dLift: .12 / 60, adjust, swing: noSwing }, bal);
      expect(ev).not.toBe('cracked');
    }
    expect(ev).toBe('out'); expect(s.inModel).toBe(false);
    expect(extractScore(s, bal)).toBeGreaterThan(bal.extractPoints * .7);
  });

  it('szybkie wyciąganie (szarpnięcie) daje większy przechył niż powolne', () => {
    const a = createLift(hooks, { x: .8, z: 0 }, .6), b = createLift(hooks, { x: .8, z: 0 }, .6);
    for (let i = 0; i < 30; i++) stepLift(a, 1 / 60, { dLift: .002, adjust: 0, swing: noSwing }, bal);
    stepLift(b, 1 / 60, { dLift: .06, adjust: 0, swing: noSwing }, bal);
    expect(b.maxTilt).toBeGreaterThanOrEqual(a.maxTilt * .99);
  });

  it('źle osadzony albo brakujący hak zwiększa nierównowagę', () => {
    const good = imbalanceOf(hooks, hooks, bal, 7), bad = imbalanceOf(hooks, [hooks[0]], bal, 7);
    expect(Math.hypot(bad.x, bad.z)).toBeGreaterThan(Math.hypot(good.x, good.z) * .3);
    const crooked = imbalanceOf(hooks, [hooks[0], { ...hooks[1], ok: false }], bal, 7);
    expect(Math.hypot(crooked.x, crooked.z)).toBeGreaterThan(Math.hypot(good.x, good.z));
  });

  it('bujanie liny przechyla formę', () => {
    const s = createLift(hooks, { x: 0, z: 0 }, .6);
    expect(tiltOf(s, { x: .1, z: 0 }, bal).mag).toBeGreaterThan(2);
  });
});
