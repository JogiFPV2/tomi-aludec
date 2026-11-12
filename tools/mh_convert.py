"""
Konwerter MakeHuman (CC0) -> zasób postaci dla gry.
Wejście: sklonowane repo makehumancommunity/makehuman (katalog makehuman/data).
Wyjście: public/assets/human/human.json + human.bin
Uruchom: python3 tools/mh_convert.py /ścieżka/do/makehuman/data
"""
import sys, os, json, struct, re
import numpy as np

D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mh/mh/makehuman/data'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'human')
os.makedirs(OUT, exist_ok=True)
S = 0.1  # MakeHuman: decymetry -> metry

# ---------- siatka bazowa ----------
V, VT, F, G = [], [], [], []  # F: [(v idx..., vt idx...)], G: grupa ściany
g = None
for line in open(os.path.join(D, '3dobjs/base.obj')):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): g = line[2:].strip()
    elif line.startswith('f '):
        parts = [p.split('/') for p in line.split()[1:]]
        F.append(([int(p[0]) - 1 for p in parts], [int(p[1]) - 1 for p in parts])); G.append(g)
V = np.array(V, dtype=np.float64); VT = np.array(VT, dtype=np.float64)
NV = len(V)
print('wierzchołki', NV, 'ściany', len(F))

KEEP = {'body': 'body', 'helper-upper-teeth': 'teeth', 'helper-lower-teeth': 'teeth', 'helper-tongue': 'tongue'}
# Wierzchołki z wieloma UV (szwy) trzeba rozdzielić: nowy wierzchołek = para (v, vt)
pairs = {}; outV = []; outVT = []; tris = {k: [] for k in set(KEEP.values())}
def vid(v, t):
    k = (v, t)
    if k not in pairs: pairs[k] = len(outV); outV.append(v); outVT.append(t)
    return pairs[k]
for (vs, ts), grp in zip(F, G):
    if grp not in KEEP: continue
    ids = [vid(v, t) for v, t in zip(vs, ts)]
    tl = tris[KEEP[grp]]
    if len(ids) == 4: tl += [ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]]
    else: tl += ids[:3]
src = np.array(outV)  # indeks oryginalnego wierzchołka dla każdego wierzchołka wyjściowego
print('wierzchołki po rozdzieleniu UV', len(src))

# grupy oczu – tylko do wyznaczenia środka i promienia gałki
def group_verts(name):
    s = set()
    for (vs, _), grp in zip(F, G):
        if grp == name: s.update(vs)
    return sorted(s)
eyes = {}
for side in 'lr':
    ids = group_verts(f'helper-{side}-eye'); P = V[ids]
    c = P.mean(0); r = float(np.linalg.norm(P - c, axis=1).mean())
    eyes[side] = {'verts': ids, 'r': r * S}
scalp = group_verts('helper-hair')

# ---------- targety ----------
TD = os.path.join(D, 'targets')
def load_target(rel):
    out = {}
    for line in open(os.path.join(TD, rel)):
        if line.startswith('#') or not line.strip(): continue
        p = line.split(); out[int(p[0])] = np.array([float(p[1]), float(p[2]), float(p[3])])
    return out
def dense(spec):
    """spec: lista (plik, waga) -> gęsta delta (NV,3)"""
    d = np.zeros((NV, 3))
    for rel, w in spec:
        for i, v in load_target(rel).items(): d[i] += v * w
    return d
U = 'macrodetails/universal-{g}-young-{m}muscle-{w}weight.target'
H = 'macrodetails/height/{g}-young-averagemuscle-averageweight-{h}height.target'
morphs = {}
for gk, gn in (('m', 'male'), ('f', 'female')):
    base = [(U.format(g=gn, m='average', w='average'), 1), (f'macrodetails/caucasian-{gn}-young.target', 1)]
    morphs[gk] = base
    avg = U.format(g=gn, m='average', w='average')
    morphs[gk + '_wmax'] = [(U.format(g=gn, m='average', w='max'), 1), (avg, -1)]
    morphs[gk + '_wmin'] = [(U.format(g=gn, m='average', w='min'), 1), (avg, -1)]
    morphs[gk + '_mmax'] = [(U.format(g=gn, m='max', w='average'), 1), (avg, -1)]
    morphs[gk + '_mmin'] = [(U.format(g=gn, m='min', w='average'), 1), (avg, -1)]
    morphs[gk + '_hmax'] = [(H.format(g=gn, h='max'), 1)]
    morphs[gk + '_hmin'] = [(H.format(g=gn, h='min'), 1)]
LR = lambda n: [(f'{n.format(s="l")}', 1), (f'{n.format(s="r")}', 1)]
simple = {
    'belly+': 'stomach/stomach-pregnant-incr', 'belly-': 'stomach/stomach-pregnant-decr',
    'headFat+': 'head/head-fat-incr', 'headFat-': 'head/head-fat-decr',
    'headRound': 'head/head-round', 'headSquare': 'head/head-square', 'headOval': 'head/head-oval',
    'headW+': 'head/head-scale-horiz-incr', 'headW-': 'head/head-scale-horiz-decr',
    'headH+': 'head/head-scale-vert-incr', 'headH-': 'head/head-scale-vert-decr',
    'chinW+': 'chin/chin-width-incr', 'chinW-': 'chin/chin-width-decr',
    'chinProm+': 'chin/chin-prominent-incr', 'chinProm-': 'chin/chin-prominent-decr',
    'noseVol+': 'nose/nose-volume-incr', 'noseVol-': 'nose/nose-volume-decr',
    'noseW+': 'nose/nose-scale-horiz-incr', 'noseW-': 'nose/nose-scale-horiz-decr',
    'nosePointW+': 'nose/nose-point-width-incr', 'noseHump+': 'nose/nose-hump-incr',
    'noseUp': 'nose/nose-point-up', 'noseDown': 'nose/nose-point-down',
    'neckW+': 'neck/neck-scale-horiz-incr', 'neckW-': 'neck/neck-scale-horiz-decr',
    'mouthOpen': 'expression/units/caucasian/mouth-open', 'smile': 'expression/units/caucasian/mouth-corner-puller',
    'smileWide': 'expression/units/caucasian/mouth-part-later', 'mouthUp': 'expression/units/caucasian/mouth-elevation',
    'frown': 'expression/units/caucasian/mouth-depression',
}
for k, v in simple.items(): morphs[k] = [(v + '.target', 1)]
pairsLR = {
    'cheeks+': 'cheek/{s}-cheek-volume-incr', 'cheeks-': 'cheek/{s}-cheek-volume-decr', 'cheekBones+': 'cheek/{s}-cheek-bones-incr',
    'squint': 'expression/units/caucasian/eye-{side}-slit', 'browsUp': 'expression/units/caucasian/eyebrows-{side}-up',
    'browsDown': 'expression/units/caucasian/eyebrows-{side}-down', 'browsInnerUp': 'expression/units/caucasian/eyebrows-{side}-inner-up',
    'earsOut': 'ears/{s}-ear-rot-backward', 'ears+': 'ears/{s}-ear-scale-incr',
    'upperarmFat+': 'armslegs/{s}-upperarm-fat-incr', 'lowerarmFat+': 'armslegs/{s}-lowerarm-fat-incr',
    'upperlegFat+': 'armslegs/{s}-upperleg-fat-incr', 'lowerlegFat+': 'armslegs/{s}-lowerleg-fat-incr',
}
for k, v in pairsLR.items():
    if '{side}' in v: morphs[k] = [(v.format(side='left') + '.target', 1), (v.format(side='right') + '.target', 1)]
    else: morphs[k] = [(v.format(s='l') + '.target', 1), (v.format(s='r') + '.target', 1)]
for k, spec in list(morphs.items()):
    miss = [r for r, _ in spec if not os.path.exists(os.path.join(TD, r))]
    if miss: print('POMIJAM', k, miss); del morphs[k]

# ---------- szkielet ----------
sk = json.load(open(os.path.join(D, 'rigs/default.mhskel')))
KEEPB = ['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'head', 'jaw']
for s in ('L', 'R'): KEEPB += [f'clavicle.{s}', f'upperarm01.{s}', f'lowerarm01.{s}', f'wrist.{s}', f'upperleg01.{s}', f'lowerleg01.{s}', f'foot.{s}']
def mapb(b):
    """kość MakeHuman -> kość gry"""
    while b not in KEEPB:
        if re.match(r'(neck0[23])', b): return 'neck01'
        if b.startswith('shoulder01'): return 'clavicle.' + b[-1]
        if b.startswith('upperarm02'): return 'upperarm01.' + b[-1]
        if b.startswith('lowerarm02'): return 'lowerarm01.' + b[-1]
        if b.startswith('upperleg02'): return 'upperleg01.' + b[-1]
        if b.startswith('lowerleg02'): return 'lowerleg01.' + b[-1]
        if b.startswith('pelvis'): return 'root'
        b = sk['bones'][b]['parent']
    return b
bones = []
for b in KEEPB:
    p = sk['bones'][b]['parent']; p = mapb(p) if p else None
    if b.startswith('upperleg01'): p = 'root'
    tailn = sk['bones'][b]['tail']
    if b.startswith('upperarm01'): tailn = sk['bones']['upperarm02.' + b[-1]]['tail']
    if b.startswith('lowerarm01'): tailn = sk['bones']['lowerarm02.' + b[-1]]['tail']
    if b.startswith('upperleg01'): tailn = sk['bones']['upperleg02.' + b[-1]]['tail']
    if b.startswith('lowerleg01'): tailn = sk['bones']['lowerleg02.' + b[-1]]['tail']
    if b == 'neck01': tailn = sk['bones']['neck03']['tail']
    bones.append({'name': b, 'parent': p, 'head': sk['bones'][b]['head'], 'tail': tailn})
BI = {b['name']: i for i, b in enumerate(bones)}
W = json.load(open(os.path.join(D, 'rigs/default_weights.mhw')))['weights']
acc = [dict() for _ in range(NV)]
for b, lst in W.items():
    gb = BI[mapb(b)]
    for i, w in lst: acc[i][gb] = acc[i].get(gb, 0) + w
skinI = np.zeros((NV, 4), np.uint8); skinW = np.zeros((NV, 4), np.uint8)
for i, a in enumerate(acc):
    top = sorted(a.items(), key=lambda x: -x[1])[:4]
    if not top: top = [(BI['root'], 1.0)]
    tot = sum(w for _, w in top); ws = [int(round(w / tot * 255)) for _, w in top]
    ws[0] += 255 - sum(ws)
    for k, (bi, _) in enumerate(top): skinI[i, k] = bi; skinW[i, k] = ws[k]

# ---------- regiony (na siatce bazowej po kształcie męskim) ----------
Pm = V + dense(morphs['m'])
J = lambda name: Pm[sk['joints'][name]].mean(0)
jn = {b: J(sk['bones'][b]['head']) for b in ['neck01', 'head', 'spine01', 'spine03', 'spine05', 'root', 'clavicle.L', 'upperarm01.L', 'lowerarm01.L', 'wrist.L', 'upperleg01.L', 'lowerleg01.L', 'foot.L', 'jaw']}
jn['footEnd'] = J(sk['bones']['foot.L']['tail'])
eyeC = Pm[eyes['l']['verts']].mean(0); eyeCr = Pm[eyes['r']['verts']].mean(0)
print({k: np.round(v, 2).tolist() for k, v in jn.items()}, 'oko', np.round(eyeC, 2))
R = {'skin': 0, 'scalp': 1, 'brows': 2, 'beard': 3, 'neck': 4, 'torso': 5, 'upperarm': 6, 'forearm': 7, 'hand': 8, 'hips': 9, 'thigh': 10, 'shin': 11, 'foot': 12, 'ankle': 13, 'lips': 14}
reg = np.zeros(NV, np.uint8)
x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
neckY = jn['neck01'][1]; headY = jn['head'][1]; eyeY = eyeC[1]; eyeZ = eyeC[2]
waistY = jn['spine03'][1] - .25; ankY = jn['foot.L'][1]
dom = skinI[:, 0]
byb = {}
for b in KEEPB: byb[BI[b]] = b.split('.')[0]
for i in range(NV):
    b = byb[int(dom[i])]
    if b in ('head', 'jaw'): r = 'skin'
    elif b == 'neck01': r = 'neck'
    elif b == 'clavicle' or b.startswith('spine') or b == 'root':
        r = 'torso' if y[i] > waistY else 'hips'
    elif b == 'upperarm01': r = 'upperarm'
    elif b == 'lowerarm01': r = 'forearm'
    elif b == 'wrist': r = 'hand'
    elif b == 'upperleg01': r = 'thigh' if y[i] < jn['upperleg01.L'][1] - .9 else 'hips'
    elif b == 'lowerleg01': r = 'shin' if y[i] > ankY + .7 else 'ankle'
    elif b == 'foot': r = 'foot'
    else: r = 'torso'
    reg[i] = R[r]
# owłosiona część głowy: nad „linią włosów” zależną od położenia przód–tył
headIds = np.where(np.isin(dom, [BI['head'], BI['neck01']]) & (y > neckY - .1))[0]
zf = z[headIds].max(); zb = z[headIds].min()
frontHair = eyeY + .62; sideHair = eyeY + .05; nape = neckY + .25
def smooth(e0, e1, t): t = np.clip((t - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
for i in headIds:
    zc = (z[i] - zb) / (zf - zb)
    th = nape + (sideHair - nape) * smooth(.12, .42, zc)
    th = th + (frontHair - th) * smooth(.62, .8, zc)
    if y[i] > th and reg[i] in (R['skin'], R['neck']): reg[i] = R['scalp']
# uszy i usta – z zasięgu odpowiednich targetów (wierzchołki, które target przesuwa)
def tset(*rels, thr=1e-3, rel_thr=0):
    out = set()
    for rel in rels:
        t = load_target(rel); mx = max(np.linalg.norm(v) for v in t.values())
        out |= {i for i, v in t.items() if np.linalg.norm(v) > max(thr, rel_thr * mx)}
    return out
ears = tset('ears/l-ear-scale-incr.target', 'ears/r-ear-scale-incr.target', rel_thr=.45)
lips = tset('mouth/mouth-lowerlip-volume-incr.target', 'mouth/mouth-upperlip-volume-incr.target', thr=.004)
R['ears'] = 15
for i in ears:
    if reg[i] in (R['scalp'], R['skin']): reg[i] = R['ears']
# zarost / broda: poniżej nosa, żuchwa i broda, z przodu
jawY = jn['jaw'][1]
for i in range(NV):
    if reg[i] != R['skin']: continue
    if y[i] < eyeY - .62 and y[i] > neckY + .05 and z[i] > jn['head'][2] + .15:
        reg[i] = R['beard']
for i in lips:
    if reg[i] in (R['beard'], R['skin']): reg[i] = R['lips']
np.save('/tmp/mh_reg.npy', reg)
print('regiony', {k: int((reg == v).sum()) for k, v in R.items()})

# ---------- zapis ----------
P = V[src] * S
UVo = VT[np.array(outVT)]
blob = bytearray(); meta = {'version': 1, 'license': 'Siatka, kształty i wagi: MakeHuman (CC0), www.makehumancommunity.org', 'units': 'm'}
def put(name, arr):
    global blob
    while len(blob) % 4: blob += b'\0'
    meta.setdefault('buffers', {})[name] = {'offset': len(blob), 'count': int(arr.size), 'type': str(arr.dtype)}
    blob += arr.tobytes()
put('base', (V * S).astype(np.float32).ravel())
put('uv', UVo.astype(np.float32).ravel())
put('src', src.astype(np.uint16))
for k, t in tris.items(): put('index_' + k, np.array(t, np.uint16))
put('skinIndex', skinI.ravel()); put('skinWeight', skinW.ravel()); put('region', reg)
meta['regions'] = R
meta['vertexCount'] = NV; meta['outVertexCount'] = len(src)
meta['bones'] = [{'name': b['name'], 'parent': b['parent'], 'head': b['head'], 'tail': b['tail']} for b in bones]
jset = sorted({j for b in bones for j in (b['head'], b['tail'])})
meta['joints'] = {}
for j in jset:
    arr = np.array(sk['joints'][j], np.uint16); put('joint_' + j, arr); meta['joints'][j] = 'joint_' + j
meta['eyes'] = {s: {'buffer': 'eye_' + s, 'r': e['r']} for s, e in eyes.items()}
for s, e in eyes.items(): put('eye_' + s, np.array(e['verts'], np.uint16))
meta['morphs'] = {}
for k, spec in morphs.items():
    d = dense(spec) * S
    nz = np.where(np.abs(d).max(1) > 2e-5)[0]
    q = np.round(d[nz] / 1e-4).clip(-32767, 32767).astype(np.int16)
    put('m_' + k + '_i', nz.astype(np.uint16)); put('m_' + k + '_d', q.ravel())
    meta['morphs'][k] = {'i': 'm_' + k + '_i', 'd': 'm_' + k + '_d', 'scale': 1e-4}
open(os.path.join(OUT, 'human.bin'), 'wb').write(blob)
json.dump(meta, open(os.path.join(OUT, 'human.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('zapisano', len(blob) // 1024, 'KB, morfy:', len(morphs))
