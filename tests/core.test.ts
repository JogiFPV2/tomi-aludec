import { describe, it, expect } from 'vitest';
import { EventBus } from '../src/core/events';
import { mergeBalance, DEFAULT_BALANCE } from '../src/core/balance';
import { CollisionWorld } from '../src/game/world/collision';
import { normalizeAppearance } from '../src/data/appearance';

describe('szyna zdarzeń', () => {
  it('dostarcza zdarzenia i pozwala się odpiąć', () => {
    const bus = new EventBus();
    const got: string[] = [];
    const off = bus.on('toast', p => got.push(p.text));
    bus.emit('toast', { text: 'a' }); off(); bus.emit('toast', { text: 'b' });
    expect(got).toEqual(['a']);
  });
  it('błąd w jednym module nie blokuje innych', () => {
    const bus = new EventBus(); let ok = false;
    bus.on('toast', () => { throw new Error('x'); });
    bus.on('toast', () => { ok = true; });
    bus.emit('toast', { text: 'a' });
    expect(ok).toBe(true);
  });
});

describe('balans', () => {
  it('wartości z serwera nadpisują domyślne, brakujące zostają', () => {
    const b = mergeBalance([{ key: 'crane', value: { fastSpeed: 2 } }, { key: 'nieznany', value: { a: 1 } }]);
    expect(b.crane.fastSpeed).toBe(2);
    expect(b.crane.slowSpeed).toBe(DEFAULT_BALANCE.crane.slowSpeed);
  });
});

describe('kolizje', () => {
  it('postać nie przechodzi przez ścianę', () => {
    const w = new CollisionWorld(); w.addRect({ x0: 1, z0: -5, x1: 1.2, z1: 5 });
    const p = w.move(0, 0, 0.3, 3, 0);
    expect(p.x).toBeLessThan(1);
  });
  it('postać ślizga się wzdłuż ściany', () => {
    const w = new CollisionWorld(); w.addRect({ x0: -5, z0: 1, x1: 5, z1: 1.2 });
    const p = w.move(0, 0, 0.3, 1, 2);
    expect(p.x).toBeCloseTo(1, 1); expect(p.z).toBeLessThan(1);
  });
});

describe('wygląd postaci', () => {
  it('uzupełnia braki i przycina wartości', () => {
    const a = normalizeAppearance({ height: 300, eyeSize: -2 } as never);
    expect(a.height).toBe(205); expect(a.eyeSize).toBe(0); expect(a.hairStyle).toBeTruthy();
  });
});
