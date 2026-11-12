import { describe, it, expect } from 'vitest';
import { createCrane, stepCrane, swingAmplitude, hookPosition, canAttach } from '../src/game/crane/craneSim';
import { DEFAULT_BALANCE } from '../src/core/balance';

const bal = DEFAULT_BALANCE.crane;
const floor = () => 0;
const dt = 1 / 60;

function run(s: ReturnType<typeof createCrane>, mx: number, seconds: number) {
  let maxAmp = 0;
  for (let t = 0; t < seconds; t += dt) { stepCrane(s, { mx, mz: 0, hoist: 0 }, dt, bal, floor); maxAmp = Math.max(maxAmp, swingAmplitude(s)); }
  return maxAmp;
}

function withLoad(gear: 1 | 2) {
  const s = createCrane(10, 10, { gear, hookY: 3 });
  s.load = { id: 'm', hang: 1, resting: false, x: 10, y: 2, z: 10 };
  return s;
}

describe('suwnica – fizyka', () => {
  it('na biegu szybkim ładunek buja się mocniej niż na wolnym', () => {
    const slow = withLoad(1), fast = withLoad(2);
    run(slow, 1, 3); run(fast, 1, 3);
    const aSlow = run(slow, 0, 2), aFast = run(fast, 0, 2);
    expect(aFast).toBeGreaterThan(aSlow * 2);
  });

  it('gwałtowna zmiana kierunku rozbujuje ładunek', () => {
    const smooth = withLoad(2), jerky = withLoad(2);
    run(smooth, 1, 4);
    let amp = 0;
    for (let i = 0; i < 4; i++) amp = Math.max(amp, run(jerky, i % 2 ? -1 : 1, 1));
    expect(amp).toBeGreaterThan(run(smooth, 1, 0.5));
  });

  it('bujanie z czasem wygasa', () => {
    const s = withLoad(2); run(s, 1, 3); run(s, 0, 1);
    const early = swingAmplitude(s); run(s, 0, 25);
    expect(swingAmplitude(s)).toBeLessThan(early * 0.5);
  });

  it('ładunek stojący na podłodze nie przesuwa się i nie buja', () => {
    const s = createCrane(5, 5, { hookY: 1.0 });
    s.load = { id: 'm', hang: 1, resting: true, x: 5, y: 0, z: 5 };
    run(s, 0, 1);
    expect(s.load.resting).toBe(true);
    expect(s.load.x).toBe(5);
  });

  it('wózek nie wyjeżdża poza tor', () => {
    const s = createCrane(2, 5, { gear: 2 });
    run(s, -1, 5);
    expect(s.x).toBeGreaterThanOrEqual(s.limits.x[0]);
  });

  it('zaczepienie wymaga haka tuż nad uchem ładunku', () => {
    const s = createCrane(5, 5, { hookY: 1.2 });
    expect(canAttach(s, { x: 5, y: 0.9, z: 5 })).toBe(true);
    expect(canAttach(s, { x: 6, y: 0.9, z: 5 })).toBe(false);
    expect(hookPosition(s).y).toBeCloseTo(1.2, 3);
  });
});
