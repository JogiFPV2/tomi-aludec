import * as THREE from 'three';
import { HumanAsset, buildHuman, addBrows, type HumanBuild, type HumanShape, type ShellSpec } from './human';
import type { Materials } from '../render/materials';
import type { Appearance } from '../../data/appearance';
import type { Avatar } from './avatar';

/**
 * Pracownik formierni na realistycznej bazie postaci: ubranie robocze, kamizelka odblaskowa, kask.
 * Wygląd (Appearance) zamieniany na parametry sylwetki i warstwy (włosy, zarost, ubranie).
 */

let assetP: Promise<HumanAsset> | null = null;
let asset: HumanAsset | null = null;
/** Wczytuje zasób postaci raz na całą grę. */
export function loadHumanAsset(base = 'assets/human/'): Promise<HumanAsset> {
  assetP ??= HumanAsset.load(base).then(a => (asset = a));
  return assetP;
}
export const humanAsset = () => asset;

// wzrost (m) postaci dla parametru wzrostu −1 / 0 / +1 – wyliczone testem (tests/human.test.ts)
export const HEIGHT_TABLE = { m: [1.382, 1.748, 2.471], k: [1.239, 1.605, 2.328] } as const;

/** cm → parametr wzrostu (−1..1) przez interpolację tabeli; reszta różnicy wyrównana skalą */
export function heightParam(cm: number, body: 'm' | 'k'): number {
  const [lo, mid, hi] = HEIGHT_TABLE[body]; const m = cm / 100;
  return m <= mid ? Math.max(-1, (m - mid) / (mid - lo)) : Math.min(1, (m - mid) / (hi - mid));
}

export function appearanceShape(a: Appearance): HumanShape {
  const morphs: Record<string, number> = {};
  const sgn = (v: number, pos: string, neg: string, k = 1) => { const d = (v - .5) * 2 * k; if (d > 0) morphs[pos] = d; else if (d < 0) morphs[neg] = -d; };
  sgn(a.noseSize, 'noseVol+', 'noseVol-', .8);
  sgn(a.noseLength, 'noseDown', 'noseUp', .6);
  if (a.earSize > .5) morphs['ears+'] = (a.earSize - .5) * 1.6;
  sgn(a.build, 'cheeks+', 'cheeks-', .4);
  return { male: a.body === 'k' ? 0 : 1, weight: (a.build - .5) * 1.8, muscle: (a.shoulders - .5) * 1.6, height: heightParam(a.height, a.body), morphs };
}

export function buildWorker(mats: Materials, a: Appearance, lowQ = false): Avatar {
  const as = asset; if (!as) throw new Error('Zasób postaci nie jest wczytany');
  const hairM = mats.color(a.hairColor);
  // pasy odblaskowe rysowane zawsze na wierzchu kamizelki
  const band = mats.color('#c3c8cb', 'reflect-band') as THREE.MeshToonMaterial; band.polygonOffset = true; band.polygonOffsetFactor = -4; band.polygonOffsetUnits = -4;
  const shells: ShellSpec[] = [
    { name: 'pants', regions: ['hips', 'thigh', 'shin', 'ankle'], offset: .008, color: '', material: mats.get('pants'), smooth: 3 },
    { name: 'jacket', regions: ['torso', 'upperarm', 'forearm', 'hips'], offset: .01, color: '', material: mats.get('jacket'), smooth: 4, filter: (p, c) => p.y > c.joint('spine03____head').y - .14 },
    { name: 'vest', regions: ['torso', 'hips'], offset: .022, color: '', material: mats.get('hivis'), smooth: 6, filter: (p, c) => p.y > c.joint('spine03____head').y - .1 && p.y < c.joint('neck01____head').y - .03 },
    { name: 'band1', regions: ['torso', 'hips'], offset: .025, color: '', material: band, smooth: 6, cover: 'all', filter: (p, c) => { const y0 = c.joint('spine03____head').y; return p.y > y0 - .04 && p.y < y0 - .01; } },
    { name: 'band2', regions: ['torso'], offset: .025, color: '', material: band, smooth: 6, cover: 'all', filter: (p, c) => { const y0 = c.joint('spine03____head').y; return p.y > y0 + .08 && p.y < y0 + .11; } },
    { name: 'gloves', regions: ['hand'], offset: .005, color: '', material: mats.get('glove'), smooth: 3 },
    { name: 'boots', regions: ['foot', 'ankle'], offset: .018, color: '', material: mats.get('rubber'), smooth: 25, hide: true, filter: p => p.y < .2 },
  ];
  // włosy
  if (a.hairStyle !== 'lysy') {
    const off = a.hairStyle === 'dluzsze' ? .014 : a.hairStyle === 'jeż' ? .004 : .007;
    shells.push({ name: 'hair', regions: ['scalp'], offset: off, color: '', material: hairM, cover: 'all', smooth: a.hairStyle === 'dluzsze' ? 3 : 1 });
  }
  // zarost
  const stub = '#' + new THREE.Color(a.hairColor).getHexString();
  if (a.beard === 'zarost') shells.push({ name: 'stubble', regions: ['beard'], offset: .0009, color: stub, opacity: .24, cover: 'all' });
  if (a.beard === 'wasy') shells.push({ name: 'beard', regions: ['beard'], offset: .003, color: '', material: hairM, smooth: 1, cover: 'all', filter: (p, c) => { const l = c.center('lips'); return p.y > l.y + .003 && Math.abs(p.x) < .028 && p.y < l.y + .022; } });
  if (a.beard === 'krotka' || a.beard === 'pelna') shells.push({ name: 'beard', regions: ['beard', 'lips'], offset: a.beard === 'pelna' ? .012 : .004, color: '', material: hairM, smooth: a.beard === 'pelna' ? 4 : 2, cover: 'all', filter: (p, c) => { const l = c.center('lips'); return !(Math.abs(p.y - l.y) < .009 && Math.abs(p.x) < .026); } });

  let helmet: THREE.Group | null = null;
  const h = buildHuman(as, appearanceShape(a), {
    skin: a.skin, eyeColor: a.eyeColor, shells, gradientMap: mats.gradient,
    extras: b => {
      addBrows(b, a.hairColor, { thick: a.body === 'k' ? .75 : 1 });
      helmet = addHelmet(b, mats, a);
      if (a.hairStyle === 'kucyk') addPonytail(b, hairM);
      if (a.hairStyle === 'jeż') addSpikes(b, hairM, .7);
      if (a.glasses !== 'none') addGlasses(b, mats, a.glasses);
    },
  });
  // dokładny wzrost z kreatora
  h.group.scale.setScalar(a.height / 100 / h.height);
  if (lowQ) h.group.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.name === 'body' || o.name === 'jacket' || o.name === 'pants'; });
  const hair = h.shell('hair');
  return {
    group: h.group,
    animate: (dt, sp) => h.animate(dt, sp),
    setHelmet(on) { if (helmet) helmet.visible = on; if (hair) hair.visible = !on || a.hairStyle === 'kucyk'; h.group.getObjectByName('spikes')!?.traverse(o => { o.visible = !on; }); },
    dispose: () => h.dispose(),
  };
}

function headInfo(h: HumanBuild) {
  const hb = h.bones['head']; const hp = new THREE.Vector3(); hb.updateWorldMatrix(true, false); hp.setFromMatrixPosition(hb.matrixWorld);
  const sc = h.regionVerts('scalp'); const mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const i of sc) { const p = new THREE.Vector3(h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]); mn.min(p); mx.max(p); }
  return { hb, hp, mn, mx };
}

function addHelmet(h: HumanBuild, mats: Materials, a: Appearance) {
  const { hb, hp, mn, mx } = headInfo(h);
  const g = new THREE.Group(); g.name = 'helmet';
  const m = mats.color(a.helmetColor);
  const rx = (mx.x - mn.x) / 2 + .018, rz = (mx.z - mn.z) / 2 + .02, ry = mx.y - (mn.y + mx.y) / 2 * 0 - (mx.y - .075) + .02;
  const cx = (mx.x + mn.x) / 2, cz = (mx.z + mn.z) / 2, baseY = mx.y - .075;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.scale.set(rx, ry, rz); dome.castShadow = true;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, .012, 28), m); brim.scale.set(rx + .014, 1, rz + .03); brim.position.set(0, .002, .012);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, rz * 2), m); ridge.position.set(0, ry - .004, 0);
  g.add(dome, brim, ridge);
  g.position.set(cx - hp.x, baseY - hp.y, cz - hp.z); hb.add(g);
  return g;
}

function addPonytail(h: HumanBuild, m: THREE.Material) {
  const { hb, hp, mn, mx } = headInfo(h);
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, mx.y - .05, mn.z + .01), new THREE.Vector3(0, mx.y - .09, mn.z - .03), new THREE.Vector3(0, mx.y - .2, mn.z - .04)]);
  const t = new THREE.Mesh(new THREE.TubeGeometry(c, 12, .02, 8), m); t.position.sub(hp); t.castShadow = true; hb.add(t);
}

function addSpikes(h: HumanBuild, m: THREE.Material, k: number) {
  const { hb, hp, mx } = headInfo(h);
  const g = new THREE.Group(); g.name = 'spikes';
  const sc = h.regionVerts('scalp').filter(i => h.pos[i * 3 + 1] > mx.y - .035);
  for (let n = 0; n < sc.length; n += 3) {
    const i = sc[n]; const p = new THREE.Vector3(h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]); const nr = new THREE.Vector3(h.nrm[i * 3], h.nrm[i * 3 + 1], h.nrm[i * 3 + 2]);
    const len = .014 * k; const cone = new THREE.Mesh(new THREE.ConeGeometry(.006, len, 5), m);
    cone.position.copy(p).addScaledVector(nr, len * .35).sub(hp); cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nr); g.add(cone);
  }
  hb.add(g);
}

function addGlasses(h: HumanBuild, mats: Materials, kind: 'korekcyjne' | 'ochronne') {
  const hb = h.bones['head']; const hp = new THREE.Vector3(); hb.updateWorldMatrix(true, false); hp.setFromMatrixPosition(hb.matrixWorld);
  const meta = h.asset.meta; const g = new THREE.Group(); const fm = mats.get(kind === 'ochronne' ? 'dark' : 'frame');
  const cs: THREE.Vector3[] = [];
  for (const s of ['l', 'r'] as const) {
    const ids = h.asset.arr<'uint16'>(meta.eyes[s].buffer); const c = new THREE.Vector3();
    for (const i of ids) c.add(new THREE.Vector3(h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2])); c.divideScalar(ids.length); cs.push(c);
    const r = meta.eyes[s].r * 1.9;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .0025, 6, 24), fm); ring.position.set(c.x, c.y, c.z + meta.eyes[s].r * 1.6); g.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mats.get('lens')); lens.position.copy(ring.position).add(new THREE.Vector3(0, 0, -.001)); g.add(lens);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.003, .003, .1), fm); arm.position.set(c.x + Math.sign(c.x) * r, c.y + .004, c.z - .035); g.add(arm);
  }
  const br = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(cs[0].x - cs[1].x) - .03, .003, .003), fm); br.position.set(0, cs[0].y + .004, cs[0].z + .022); g.add(br);
  g.position.sub(hp); hb.add(g);
}
