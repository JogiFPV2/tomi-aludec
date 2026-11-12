import { describe, it, expect } from 'vitest';
import { PourSim } from '../src/game/pour/pourSim';
import { MODELS_DB } from '../src/data/models';
import { DEFAULT_BALANCE } from '../src/core/balance';

const def = MODELS_DB[0];
const bal = DEFAULT_BALANCE.pour;
const run = (s: PourSim, sec: number) => { for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30); };

/** sypie, przesuwając ramię po całym modelu (meander) */
function pourAll(s: PourSim, maxSec = 300, onStep?: () => void) {
  let t = 0, k = 0;
  s.setArmTarget(0, 0); for (let i = 0; i < 90; i++) s.step(1 / 30);
  s.start();
  while (t < maxSec && s.fill() < .985) { if (k++ % 10 === 0) { const p = s.lowestPoint(); s.setArmTarget(p.x, p.z); } s.step(1 / 30); onStep?.(); t += 1 / 30; }
  s.pause(); run(s, .5);
}

describe('sypanie – maszyna', () => {
  it('masa leci dopiero po opóźnieniu, a czas liczy się od Start', () => {
    const s = new PourSim(def, bal); s.setArmTarget(0, .3); run(s, 3);
    s.start(); run(s, bal.startDelaySec - .3);
    expect(s.machine).toBe('start'); expect(s.sand.reduce((a, b) => a + b, 0)).toBe(0);
    expect(s.t).toBeGreaterThan(1.5);
    run(s, .6); expect(s.machine).toBe('sypie');
  });
  it('zbyt długa pauza osłabia masę, a wyładunek ją przywraca', () => {
    const s = new PourSim(def, bal); s.start(); run(s, 3); s.pause(); run(s, bal.maxPauseSec + 1);
    expect(s.massWeak).toBe(true);
    expect(s.unload()).toBeNull(); run(s, bal.unloadSec + .1);
    expect(s.massWeak).toBe(false); expect(s.machine).toBe('stoi');
  });
  it('wyładunek wymaga pauzy', () => {
    const s = new PourSim(def, bal); s.start(); run(s, 1);
    expect(s.unload()).toMatch(/Pauz/);
  });
  it('sypanie obok modelu liczy się jako rozsypana masa', () => {
    const s = new PourSim(def, bal); s.start(); run(s, 6);
    expect(s.spillKg).toBeGreaterThan(5);
  });
});

describe('sypanie – podbicia, haki, wynik', () => {
  it('podbicie za wcześnie nie liczy się', () => {
    const s = new PourSim(def, bal);
    expect(s.tapMetal(0).ok).toBe(false);
    expect(s.metals[0].taps).toBe(0);
  });
  it('pełne podbicia i haki dają wynik bez kar za metale', () => {
    const s = new PourSim(def, bal);
    pourAll(s, 400, () => {
      s.metals.forEach((m, k) => { const lvl = s.sandLevelNear(m.x, m.z); if (lvl > m.top * .7 && lvl < m.top + .1) s.tapMetal(k); });
      s.hooks.forEach((_, k) => s.placeHook(k));
    });
    expect(s.canFinish()).toBe(true);
    const r = s.finish();
    expect(r.tapMissing).toHaveLength(0); expect(r.hooksMissing).toBe(0);
    expect(r.points).toBeGreaterThan(200);
  });
  it('brak podbić daje kary 100 / 70 / 30 jak w założeniach', () => {
    const s = new PourSim(def, bal); pourAll(s);
    s.metals[0].taps = 0; s.metals[1].taps = 1; s.metals[2].taps = 1; s.metals[3].taps = 2;
    const r = s.finish(); const pen = Object.fromEntries(r.tapMissing.map(t => [t.slot, t.penalty]));
    expect(pen['lewy tył']).toBe(100);   // 3 z 3 brakuje
    expect(pen['prawy tył']).toBe(70);   // 2 z 3
    expect(pen['lewy przód']).toBe(70);  // 1 z 2 – połowa
    expect(pen['prawy przód']).toBeUndefined();
    expect(r.hooksMissing).toBe(2);
  });
});
