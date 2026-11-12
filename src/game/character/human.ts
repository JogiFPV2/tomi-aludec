import * as THREE from 'three';

/**
 * Realistyczna postać na bazie siatki MakeHuman (CC0).
 * Kształt ciała = siatka bazowa + ważone „morfy” (tusza, mięśnie, wzrost, brzuch, twarz…), liczone raz przy budowie.
 * Ubrania, włosy, brwi i zarost to „powłoki”: kawałki skóry wybrane po regionach i odsunięte wzdłuż normalnych.
 * Wszystko jest skinowane do jednego, uproszczonego szkieletu (23 kości) – animacja chodu jest proceduralna.
 */

export interface HumanMeta {
  buffers: Record<string, { offset: number; count: number; type: string }>;
  regions: Record<string, number>;
  vertexCount: number; outVertexCount: number;
  bones: { name: string; parent: string | null; head: string; tail: string }[];
  joints: Record<string, string>;
  eyes: Record<'l' | 'r', { buffer: string; r: number }>;
  morphs: Record<string, { i: string; d: string; scale: number }>;
  license: string;
}

const ARR = { float32: Float32Array, uint16: Uint16Array, int16: Int16Array, uint8: Uint8Array } as const;

export class HumanAsset {
  constructor(readonly meta: HumanMeta, private buf: ArrayBuffer) {}
  arr<K extends keyof typeof ARR>(name: string): InstanceType<(typeof ARR)[K]> {
    const b = this.meta.buffers[name]; if (!b) throw new Error('Brak bufora ' + name);
    const T = ARR[b.type as K] as unknown as new (buf: ArrayBuffer, off: number, n: number) => InstanceType<(typeof ARR)[K]>;
    return new T(this.buf, b.offset, b.count);
  }
  static async load(base = 'assets/human/'): Promise<HumanAsset> {
    const [m, b] = await Promise.all([fetch(base + 'human.json').then(r => r.json()), fetch(base + 'human.bin').then(r => r.arrayBuffer())]);
    return new HumanAsset(m as HumanMeta, b);
  }
}

/** Parametry sylwetki. Wartości „±” w zakresie −1..1, 0 = przeciętnie. */
export interface HumanShape {
  male: number;      // 1 mężczyzna, 0 kobieta
  weight: number;    // tusza
  muscle: number;    // umięśnienie
  height: number;    // wzrost
  /** dodatkowe morfy po nazwie (np. 'belly+', 'smile', 'cheeks+') z wagą 0..1 */
  morphs?: Record<string, number>;
}

/** Pomocnicze dane o kształcie (dla filtrów regionów). */
export interface ShapeCtx { center(region: string): THREE.Vector3; top(region: string): number; joint(name: string): THREE.Vector3 }

export interface ShellSpec {
  regions: string[]; offset: number; color: string; name: string; outline?: boolean; opacity?: number;
  filter?: (p: THREE.Vector3, ctx: ShapeCtx) => boolean;
  /** gotowy materiał (np. z tekstury tkaniny) zamiast koloru */
  material?: THREE.Material;
  /** 'any' – trójkąt wchodzi, gdy choć jeden wierzchołek pasuje (bez szczelin na granicach regionów) */
  cover?: 'any' | 'all';
  /** wygładzanie (liczba przebiegów) – ubrania nie odwzorowują mięśni ani palców stóp */
  smooth?: number;
  /** ukryj skórę pod spodem (buty) i nie dociskaj powłoki do kształtu ciała */
  hide?: boolean;
}

export interface HumanLook {
  skin: string;
  eyeColor: string;
  shells: ShellSpec[];
  /** własne dodatki (włosy, kask…) – wywoływane po zbudowaniu szkieletu */
  extras?: (h: HumanBuild) => void;
  gradientMap?: THREE.Texture;
}

export interface HumanBuild {
  group: THREE.Group;
  bones: Record<string, THREE.Bone>;
  /** pozycje spoczynkowe (świat postaci) wszystkich wierzchołków siatki bazowej */
  pos: Float32Array; nrm: Float32Array;
  asset: HumanAsset;
  /** wysokość postaci w metrach */
  height: number;
  /** pozycja stawu w spoczynku */
  joint(name: string): THREE.Vector3;
  /** wierzchołki (indeksy bazowe) danego regionu */
  regionVerts(name: string): number[];
  /** siatki powłok po nazwie (np. do chowania włosów pod kaskiem) */
  shell(name: string): THREE.Object3D | undefined;
  ctx: ShapeCtx;
  mat(color: string, opts?: THREE.MeshToonMaterialParameters): THREE.MeshToonMaterial;
  animate(dt: number, speed: number): void;
  /** ustawia kość wzdłuż kierunku w układzie postaci (pozy) */
  aim(name: string, dir: THREE.Vector3, twist?: THREE.Quaternion): void;
  dispose(): void;
}

export function morphWeights(s: HumanShape): Record<string, number> {
  const w: Record<string, number> = {};
  const m = Math.min(1, Math.max(0, s.male)), f = 1 - m;
  const pos = (v: number) => Math.max(0, Math.min(1, v)), neg = (v: number) => Math.max(0, Math.min(1, -v));
  for (const [k, g] of [['m', m], ['f', f]] as const) {
    if (!g) continue;
    w[k] = g;
    w[k + '_wmax'] = g * pos(s.weight); w[k + '_wmin'] = g * neg(s.weight);
    w[k + '_mmax'] = g * pos(s.muscle); w[k + '_mmin'] = g * neg(s.muscle);
    w[k + '_hmax'] = g * pos(s.height); w[k + '_hmin'] = g * neg(s.height);
  }
  for (const [k, v] of Object.entries(s.morphs ?? {})) w[k] = (w[k] ?? 0) + v;
  return w;
}

/** Pozycje wierzchołków po nałożeniu kształtu (czysta funkcja – testowalna bez grafiki). */
export function shapePositions(a: HumanAsset, s: HumanShape): Float32Array {
  const pos = new Float32Array(a.arr<'float32'>('base'));
  for (const [k, wt] of Object.entries(morphWeights(s))) {
    const md = a.meta.morphs[k]; if (!md || !wt) continue;
    const idx = a.arr<'uint16'>(md.i), d = a.arr<'int16'>(md.d), sc = md.scale * wt;
    for (let n = 0; n < idx.length; n++) { const v = idx[n] * 3; pos[v] += d[n * 3] * sc; pos[v + 1] += d[n * 3 + 1] * sc; pos[v + 2] += d[n * 3 + 2] * sc; }
  }
  return pos;
}

const V3 = (a: Float32Array, i: number) => new THREE.Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);

export function buildHuman(a: HumanAsset, shape: HumanShape, look: HumanLook): HumanBuild {
  const meta = a.meta;
  const pos = shapePositions(a, shape);
  const src = a.arr<'uint16'>('src'), uv = a.arr<'float32'>('uv');
  const body = a.arr<'uint16'>('index_body'), teeth = a.arr<'uint16'>('index_teeth');
  const sI = a.arr<'uint8'>('skinIndex'), sW = a.arr<'uint8'>('skinWeight'), reg = a.arr<'uint8'>('region');
  const NV = meta.vertexCount;

  // stopy na podłodze
  let minY = Infinity, maxY = -Infinity;
  for (let n = 0; n < body.length; n++) { const y = pos[src[body[n]] * 3 + 1]; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let v = 0; v < NV; v++) pos[v * 3 + 1] -= minY;

  // gładkie normalne na siatce bazowej (bez szwów UV)
  const nrm = new Float32Array(NV * 3);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < body.length; t += 3) {
    const A = src[body[t]], B = src[body[t + 1]], C = src[body[t + 2]];
    pa.fromArray(pos, A * 3); pb.fromArray(pos, B * 3); pc.fromArray(pos, C * 3);
    e1.subVectors(pb, pa); e2.subVectors(pc, pa); e1.cross(e2);
    for (const v of [A, B, C]) { nrm[v * 3] += e1.x; nrm[v * 3 + 1] += e1.y; nrm[v * 3 + 2] += e1.z; }
  }
  for (let v = 0; v < NV; v++) { const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1; nrm[v * 3] /= l; nrm[v * 3 + 1] /= l; nrm[v * 3 + 2] /= l; }

  // szkielet: stawy = średnia wierzchołków z grup „joint-…”
  const jcache = new Map<string, THREE.Vector3>();
  const joint = (name: string) => {
    let j = jcache.get(name); if (j) return j.clone();
    const ids = a.arr<'uint16'>(meta.joints[name]); j = new THREE.Vector3();
    for (const i of ids) j.add(V3(pos, i)); j.divideScalar(ids.length); jcache.set(name, j); return j.clone();
  };
  const bones: Record<string, THREE.Bone> = {}; const list: THREE.Bone[] = [];
  const heads: Record<string, THREE.Vector3> = {};
  for (const b of meta.bones) {
    const bone = new THREE.Bone(); bone.name = b.name; heads[b.name] = joint(b.head);
    bone.position.copy(heads[b.name]); if (b.parent) { bone.position.sub(heads[b.parent]); bones[b.parent].add(bone); }
    bones[b.name] = bone; list.push(bone);
  }
  const skeleton = new THREE.Skeleton(list);
  const group = new THREE.Group(); const rig = list[0]; group.add(rig);
  group.updateMatrixWorld(true);

  const mats: THREE.Material[] = []; const geos: THREE.BufferGeometry[] = [];
  const mat = (color: string, opts: THREE.MeshToonMaterialParameters = {}) => {
    const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: look.gradientMap ?? null, ...opts }); mats.push(m); return m;
  };
  const regionId = meta.regions;

  /** geometria z listy trójkątów (indeksy wyjściowe), odsunięta o `off` wzdłuż normalnych */
  function geometry(tris: ArrayLike<number>, off: number, filter?: (o: number) => boolean, any = false, smooth = 0, push = true) {
    const map = new Map<number, number>(); const idx: number[] = []; const adj = new Map<number, Set<number>>();
    for (let t = 0; t < tris.length; t += 3) {
      if (filter) { const c = +filter(tris[t]) + +filter(tris[t + 1]) + +filter(tris[t + 2]); if (any ? c === 0 : c < 3) continue; }
      for (let k = 0; k < 3; k++) { const o = tris[t + k]; let n = map.get(o); if (n === undefined) { n = map.size; map.set(o, n); } idx.push(n); }
      if (smooth > 0) for (let k = 0; k < 3; k++) {
        const a0 = src[tris[t + k]]; let s = adj.get(a0); if (!s) adj.set(a0, s = new Set());
        s.add(src[tris[t + (k + 1) % 3]]); s.add(src[tris[t + (k + 2) % 3]]);
      }
    }
    const n = map.size; const P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2), SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
    // wygładzanie na wierzchołkach bazowych (bez szwów UV), potem odsunięcie na zewnątrz skóry
    let sp: Map<number, number[]> | null = null;
    if (smooth > 0) {
      sp = new Map(); for (const v of adj.keys()) sp.set(v, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
      for (let it = 0; it < smooth; it++) {
        const nx = new Map<number, number[]>();
        for (const [v, nb] of adj) {
          const p = sp.get(v)!; const q = [0, 0, 0];
          for (const u of nb) { const r = sp.get(u)!; q[0] += r[0]; q[1] += r[1]; q[2] += r[2]; }
          const k = nb.size; nx.set(v, [p[0] * .4 + q[0] / k * .6, p[1] * .4 + q[1] / k * .6, p[2] * .4 + q[2] / k * .6]);
        }
        sp = nx;
      }
    }
    for (const [o, k] of map) {
      const v = src[o];
      if (sp) {
        const q = sp.get(v)!; const nx = nrm[v * 3], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
        const d = (q[0] - pos[v * 3]) * nx + (q[1] - pos[v * 3 + 1]) * ny + (q[2] - pos[v * 3 + 2]) * nz;
        const pz = push ? Math.max(off, d) - d : off; // zwykle nigdy pod skórą
        for (let c = 0; c < 3; c++) { N[k * 3 + c] = nrm[v * 3 + c]; P[k * 3 + c] = q[c] + nrm[v * 3 + c] * pz; }
      } else for (let c = 0; c < 3; c++) { N[k * 3 + c] = nrm[v * 3 + c]; P[k * 3 + c] = pos[v * 3 + c] + nrm[v * 3 + c] * off; }
      UV[k * 2] = uv[o * 2]; UV[k * 2 + 1] = uv[o * 2 + 1];
      for (let c = 0; c < 4; c++) { SI[k * 4 + c] = sI[v * 4 + c]; SW[k * 4 + c] = sW[v * 4 + c] / 255; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    g.setIndex(idx); geos.push(g); return g;
  }
  const skinned = (g: THREE.BufferGeometry, m: THREE.Material, name: string) => {
    const s = new THREE.SkinnedMesh(g, m); s.name = name; s.bind(skeleton); s.castShadow = true; s.frustumCulled = false; group.add(s); return s;
  };

  // ciało (bez skóry schowanej pod pełnymi ubraniami, np. butami – inaczej palce przebijałyby but)
  const tmp = new THREE.Vector3();
  const cc = new Map<string, THREE.Vector3>(), tc = new Map<string, number>();
  const ctx: ShapeCtx = {
    center(r) { let c = cc.get(r); if (!c) { c = new THREE.Vector3(); let n = 0; const id = regionId[r]; for (let v = 0; v < NV; v++) if (reg[v] === id) { c.x += pos[v * 3]; c.y += pos[v * 3 + 1]; c.z += pos[v * 3 + 2]; n++; } c.divideScalar(n || 1); cc.set(r, c); } return c.clone(); },
    top(r) { let t = tc.get(r); if (t === undefined) { t = -Infinity; const id = regionId[r]; for (let v = 0; v < NV; v++) if (reg[v] === id) t = Math.max(t, pos[v * 3 + 1]); tc.set(r, t); } return t; },
    joint: n => joint(n),
  };
  const hidden = look.shells.filter(sh => sh.hide).map(sh => { const ids = new Set(sh.regions.map(r => regionId[r])); return (v: number) => ids.has(reg[v]) && (!sh.filter || sh.filter(tmp.fromArray(pos, v * 3), ctx)); });
  skinned(geometry(body, 0, hidden.length ? (o => !hidden.some(h => h(src[o]))) : undefined, true), mat(look.skin), 'body');
  skinned(geometry(teeth, 0), mat('#efe9dc'), 'teeth');
  // powłoki: ubrania, włosy, brwi, zarost
  for (const sh of look.shells) {
    const ids = new Set(sh.regions.map(r => regionId[r]));
    const f = (o: number) => { const v = src[o]; if (!ids.has(reg[v])) return false; return !sh.filter || sh.filter(tmp.fromArray(pos, v * 3), ctx); };
    const m = sh.material ?? mat(sh.color, sh.opacity !== undefined ? { transparent: true, opacity: sh.opacity, depthWrite: false } : {});
    if (!sh.material && (sh.outline === false || sh.opacity !== undefined)) m.userData.outlineParameters = { visible: false };
    if (sh.opacity !== undefined) {
      m.polygonOffset = true; m.polygonOffsetFactor = -1;
      // mieszanie tylko koloru – przezroczystość płótna (alpha) zostaje nietknięta
      m.blending = THREE.CustomBlending; m.blendSrc = THREE.SrcAlphaFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
    }
    const sm = skinned(geometry(body, sh.offset, f, (sh.cover ?? 'any') === 'any', sh.smooth ?? 0, !sh.hide), m, sh.name); sm.renderOrder = sh.opacity !== undefined ? 1 : 0; if (sh.opacity !== undefined) sm.castShadow = false;
  }

  // oczy: kule z tęczówką z kolorów wierzchołków, przypięte do kości głowy
  const headB = bones['head'];
  for (const side of ['l', 'r'] as const) {
    const e = meta.eyes[side]; const ids = a.arr<'uint16'>(e.buffer); const c = new THREE.Vector3();
    for (const i of ids) c.add(V3(pos, i)); c.divideScalar(ids.length);
    const g = new THREE.SphereGeometry(e.r * .98, 28, 20); g.rotateX(Math.PI / 2);
    const col = new Float32Array(g.attributes.position.count * 3); const n = g.attributes.normal as THREE.BufferAttribute;
    const sclera = new THREE.Color('#f2ede4'), iris = new THREE.Color(look.eyeColor), dark = iris.clone().multiplyScalar(.55), pupil = new THREE.Color('#0b0a09');
    for (let v = 0; v < n.count; v++) {
      const z = n.getZ(v); const cc = z > .962 ? pupil : z > .87 ? iris : z > .845 ? dark : sclera;
      col[v * 3] = cc.r; col[v * 3 + 1] = cc.g; col[v * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); geos.push(g);
    const em = mat('#ffffff', { vertexColors: true }); em.userData.outlineParameters = { thickness: .002 };
    const eye = new THREE.Mesh(g, em); eye.name = 'eye_' + side;
    eye.position.copy(c).sub(heads['head']); headB.add(eye);
  }

  const height = maxY - minY;
  const regionVerts = (name: string) => { const id = regionId[name]; const out: number[] = []; for (let v = 0; v < NV; v++) if (reg[v] === id) out.push(v); return out; };

  // kierunki kości w spoczynku (siatka bazowa ma pozę „A” z przedramionami wysuniętymi do przodu)
  const restDir: Record<string, THREE.Vector3> = {};
  for (const b of meta.bones) restDir[b.name] = joint(b.tail).sub(heads[b.name]).normalize();
  const worldQ = new Map<string, THREE.Quaternion>();
  const parentQ = (name: string) => { let p = meta.bones.find(b => b.name === name)!.parent; const q = new THREE.Quaternion(); const chain: string[] = []; while (p) { chain.unshift(p); p = meta.bones.find(b => b.name === p)!.parent; } for (const c of chain) q.multiply(bones[c].quaternion); return q; };
  /** Ustawia kość tak, by w układzie postaci wskazywała kierunek `dir` (wywoływać od tułowia w dół). */
  const aim = (name: string, dir: THREE.Vector3, twist?: THREE.Quaternion) => {
    const qw = new THREE.Quaternion().setFromUnitVectors(restDir[name], dir.clone().normalize()); if (twist) qw.premultiply(twist);
    bones[name].quaternion.copy(parentQ(name).invert().multiply(qw)); worldQ.set(name, qw);
  };
  const X = new THREE.Vector3(1, 0, 0);
  const qs = new THREE.Quaternion();
  let phase = 0, amp = 0;
  const build: HumanBuild = {
    group, bones, pos, nrm, asset: a, height,
    joint: (n: string) => joint(n),
    regionVerts, mat, aim, ctx,
    shell: (n: string) => group.getObjectByName(n),
    animate(dt, speed) {
      const target = Math.min(1, speed / 2.2); amp += (target - amp) * Math.min(1, dt * 8);
      phase += dt * (2.2 + speed * 2.6);
      const s = Math.sin(phase), c = Math.cos(phase);
      const legA = .55 * amp, armA = .45 * amp;
      bones['spine05'].quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s * .08 * amp);
      for (const [side, sg] of [['L', 1], ['R', -1]] as const) {
        const ph = sg * s;
        bones['upperleg01.' + side].quaternion.setFromAxisAngle(X, -ph * legA);
        bones['lowerleg01.' + side].quaternion.setFromAxisAngle(X, Math.max(0, sg * c) * .9 * amp + .02);
        bones['foot.' + side].quaternion.setFromAxisAngle(X, -Math.max(0, -sg * c) * .25 * amp);
        qs.setFromAxisAngle(X, -ph * armA);
        aim('upperarm01.' + side, new THREE.Vector3(sg * .2, -1, -.02), qs);
        aim('lowerarm01.' + side, new THREE.Vector3(sg * .08, -1, .18 + Math.max(0, ph) * .9 * amp), qs);
      }
      rig.position.y = heads['root'].y + Math.abs(c) * .025 * amp;
    },
    dispose() { geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); skeleton.dispose(); },
  };
  build.animate(0, 0);
  look.extras?.(build);
  return build;
}

/** Brwi jako cienkie, zwężające się wstęgi dopasowane do czoła (ostrzejsze niż malowanie na skórze). */
export function addBrows(h: HumanBuild, color: string, o: { thick?: number; lift?: number; tilt?: number; arch?: number; len?: number } = {}) {
  const { thick = 1, lift = 0, tilt = 0, arch = 1, len = 1 } = o;
  const meta = h.asset.meta; const pos = h.pos, nrm = h.nrm;
  const headB = h.bones['head']; const hp = new THREE.Vector3(); headB.updateWorldMatrix(true, false); hp.setFromMatrixPosition(headB.matrixWorld);
  // kość głowy może być przeskalowana – liczymy w układzie spoczynkowym, potem odwracamy skalę
  const inv = 1 / headB.scale.x;
  const face: number[] = [];
  for (let v = 0; v < meta.vertexCount; v++) if (pos[v * 3 + 1] > hp.y - .02 && pos[v * 3 + 2] > hp.z) face.push(v);
  const m = h.mat(color);
  for (const side of ['l', 'r'] as const) {
    const ids = h.asset.arr<'uint16'>(meta.eyes[side].buffer); const c = new THREE.Vector3();
    for (const i of ids) c.add(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])); c.divideScalar(ids.length);
    const s = Math.sign(c.x) || 1; const N = 14;
    const pts: THREE.Vector3[] = [], nrms: THREE.Vector3[] = [], wid: number[] = [];
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const x = c.x + s * (-.016 + t * .044 * len), y = c.y + .019 + lift + arch * .006 * Math.sin(Math.PI * Math.min(1, t * 1.15)) - tilt * (t - .35) * .012;
      let best = -1, bz = -1e9;
      for (const v of face) { const dx = pos[v * 3] - x, dy = pos[v * 3 + 1] - y; if (dx * dx + dy * dy < 3.6e-5 && pos[v * 3 + 2] > bz) { bz = pos[v * 3 + 2]; best = v; } }
      if (best < 0) continue;
      const n = new THREE.Vector3(nrm[best * 3], nrm[best * 3 + 1], nrm[best * 3 + 2]);
      pts.push(new THREE.Vector3(x, y, bz).addScaledVector(n, .0018)); nrms.push(n);
      wid.push((.0046 - t * .0024) * thick);
    }
    if (pts.length < 3) continue;
    const R = 6, P: number[] = [], idx: number[] = [];
    for (let k = 0; k < pts.length; k++) {
      const T = (k < pts.length - 1 ? pts[k + 1].clone().sub(pts[k]) : pts[k].clone().sub(pts[k - 1])).normalize();
      const B = new THREE.Vector3().crossVectors(nrms[k], T).normalize();
      for (let r = 0; r < R; r++) {
        const a = r / R * Math.PI * 2; const p = pts[k].clone().addScaledVector(B, Math.cos(a) * wid[k]).addScaledVector(nrms[k], Math.sin(a) * .0012);
        p.sub(hp).multiplyScalar(inv); P.push(p.x, p.y, p.z);
      }
    }
    for (let k = 0; k < pts.length - 1; k++) for (let r = 0; r < R; r++) {
      const a = k * R + r, b = k * R + (r + 1) % R, cc = a + R, d = b + R; idx.push(a, cc, b, b, cc, d);
    }
    const last = (pts.length - 1) * R; P.push(...pts[0].clone().sub(hp).multiplyScalar(inv).toArray(), ...pts[pts.length - 1].clone().sub(hp).multiplyScalar(inv).toArray());
    const c0 = P.length / 3 - 2, c1 = P.length / 3 - 1;
    for (let r = 0; r < R; r++) { idx.push(c0, (r + 1) % R, r); idx.push(c1, last + r, last + (r + 1) % R); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m); mesh.name = 'brow_' + side; headB.add(mesh);
  }
}
