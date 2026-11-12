import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HumanAsset, shapePositions, morphWeights } from '../src/game/character/human';
import { HEIGHT_TABLE, heightParam } from '../src/game/character/worker';

const meta = JSON.parse(readFileSync('public/assets/human/human.json', 'utf8'));
const bin = readFileSync('public/assets/human/human.bin');
const asset = new HumanAsset(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));

function heightOf(male: number, height: number) {
  const p = shapePositions(asset, { male, weight: 0, muscle: 0, height });
  const src = asset.arr<'uint16'>('src'), idx = asset.arr<'uint16'>('index_body');
  let lo = Infinity, hi = -Infinity; for (const o of idx) { const y = p[src[o] * 3 + 1]; lo = Math.min(lo, y); hi = Math.max(hi, y); }
  return hi - lo;
}

describe('postać – zasób MakeHuman', () => {
  it('zasób ma szkielet, regiony i morfy', () => {
    expect(meta.bones.length).toBe(23);
    for (const r of ['scalp', 'beard', 'torso', 'foot', 'ears', 'lips']) expect(meta.regions[r]).toBeTypeOf('number');
    for (const m of ['m', 'f', 'm_wmax', 'belly+', 'smile']) expect(meta.morphs[m]).toBeTruthy();
  });
  it('tabela wzrostu zgadza się z modelem (±1 cm)', () => {
    for (const [b, male] of [['m', 1], ['k', 0]] as const) HEIGHT_TABLE[b].forEach((h, i) => expect(Math.abs(heightOf(male, i - 1) - h)).toBeLessThan(.01));
  });
  it('parametr wzrostu: przeciętny = 0, skrajne przycięte', () => {
    expect(heightParam(HEIGHT_TABLE.m[1] * 100, 'm')).toBeCloseTo(0, 5);
    expect(heightParam(120, 'm')).toBe(-1); expect(heightParam(250, 'k')).toBe(1);
  });
  it('tusza i płeć dają wagi morfów sumujące się do płci', () => {
    const w = morphWeights({ male: .3, weight: .5, muscle: -1, height: 0 });
    expect(w.m + w.f).toBeCloseTo(1); expect(w.m_wmax).toBeCloseTo(.15); expect(w.f_mmin).toBeCloseTo(.7);
  });
});
