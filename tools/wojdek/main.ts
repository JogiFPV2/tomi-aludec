// Strona z karykaturami Wojdka – realistyczna baza postaci (MakeHuman) w stylu gry.
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { HumanAsset, buildHuman, addBrows, type HumanBuild, type HumanShape, type ShellSpec } from '../../src/game/character/human';

declare const HUMAN_JSON: unknown; declare const HUMAN_BIN: string;

const grad = (() => { const d = new Uint8Array([125, 175, 222, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const C = { skin: '#d4906e', hair: '#1e1713', fade: '#5a493d', brow: '#2a1f19', tee: '#1c1d20', jeans: '#3a4660', boot: '#2b2420', vest: '#d8e636', vestBand: '#c9cdd0', chain: '#d9b34a', eye: '#7f9a8a', stub: '#3b2b22' };

interface Variant { id: string; name: string; desc: string; chips: string[]; shape: HumanShape; headScale: number; spikes: number; outfit: 'tee' | 'vest'; pose: 'idle' | 'hips' | 'thumb' | 'clip' }

const face = (o: Record<string, number>) => o;
const VARIANTS: Variant[] = [
  { id: 'A', name: 'Uśmiech z urlopu', desc: 'Najbliżej zdjęć: szeroki uśmiech, zmrużone oczy, pełne policzki i czub na żel. Niski, z wyraźnym brzuchem.', chips: ['wzrost ok. 165 cm', 'brzuch +', 'szeroki uśmiech'],
    shape: { male: 1, weight: .9, muscle: 0, height: -.25, morphs: face({ 'belly+': 1.4, 'headFat+': .55, 'cheeks+': .8, headRound: .5, 'chinW+': .4, 'noseVol+': .35, 'noseW+': .3, smile: 1, smileWide: .5, squint: .1, 'ears+': .25, 'neckW+': .6 }) },
    headScale: 1.06, spikes: 1, outfit: 'tee', pose: 'idle' },
  { id: 'B', name: 'Kierownik na kontroli', desc: 'Wersja do gry: kamizelka odblaskowa na czarnej koszulce i podkładka z listą błędów. Pewny siebie półuśmiech, jedna brew w górze.', chips: ['kamizelka', 'podkładka', 'półuśmiech'],
    shape: { male: 1, weight: .95, muscle: 0, height: -.25, morphs: face({ 'belly+': 1.4, 'headFat+': .55, 'cheeks+': .75, headRound: .45, 'chinW+': .4, 'noseVol+': .35, smile: .55, squint: .1, browsUp: .4, 'neckW+': .6 }) },
    headScale: 1.08, spikes: 1, outfit: 'vest', pose: 'clip' },
  { id: 'C', name: 'Poważna mina', desc: 'Szef patrzy, jak pracujesz: poważna mina, brwi ściągnięte w dół. Brzuch i krępa sylwetka wyolbrzymione najmocniej.', chips: ['brzuch ++', 'brwi w dół', 'gruby kark'],
    shape: { male: 1, weight: 1, muscle: .2, height: -.3, morphs: face({ 'belly+': 1.7, 'headFat+': .7, 'cheeks+': .9, headSquare: .3, 'chinW+': .6, 'noseVol+': .45, browsDown: .7, frown: .35, squint: .1, 'neckW+': 1 }) },
    headScale: 1.08, spikes: 1.1, outfit: 'tee', pose: 'idle' },
  { id: 'D', name: 'Duża głowa', desc: 'Najmocniejsza karykatura: powiększona głowa, bardzo wysoki czub, uśmiech od ucha do ucha i ręka uniesiona na powitanie.', chips: ['głowa +30%', 'czub ×1,6', 'macha na powitanie'],
    shape: { male: 1, weight: 1, muscle: 0, height: -.35, morphs: face({ 'belly+': 1.6, 'headFat+': .8, 'cheeks+': 1, headRound: .7, 'chinW+': .5, 'noseVol+': .6, 'noseW+': .4, smile: 1, smileWide: .8, mouthOpen: .15, squint: .15, 'ears+': .5, 'neckW+': .7 }) },
    headScale: 1.3, spikes: 1.6, outfit: 'tee', pose: 'thumb' },
];

function shells(v: Variant, headTop: number, hipTop: number): ShellSpec[] {
  const s: ShellSpec[] = [
    { name: 'tee', regions: ['torso', 'upperarm', 'hips'], offset: .008, color: C.tee, smooth: 4, filter: p => p.y > hipTop - .15 },
    { name: 'jeans', regions: ['hips', 'thigh', 'shin', 'ankle'], offset: .007, color: C.jeans, smooth: 3 },
    { name: 'boots', regions: ['foot', 'ankle'], offset: .018, color: C.boot, smooth: 25, hide: true, filter: p => p.y < .16 },
    { name: 'fade', regions: ['scalp'], offset: .0025, color: C.fade, cover: 'all' },
    // pas włosów na czubku (od czoła do ciemienia)
    { name: 'top', regions: ['scalp'], offset: .007, color: C.hair, cover: 'all', filter: p => Math.abs(p.x) < .05 + (p.y - headTop + .05) * .4 && p.y > headTop - .065 },
    { name: 'stubble', regions: ['beard'], offset: .0009, color: C.stub, opacity: .2, cover: 'all' },
  ];
  if (v.outfit === 'vest') s.push({ name: 'vest', regions: ['torso'], offset: .016, color: C.vest, smooth: 5 });
  return s;
}

function addExtras(h: HumanBuild, v: Variant) {
  addBrows(h, C.brow, { thick: 1.15, lift: v.id === 'C' ? -.003 : 0, tilt: v.id === 'C' ? -.5 : 0 });
  const head = h.bones['head']; const hp = new THREE.Vector3(); head.getWorldPosition(hp);
  // kolce włosów: na czubku, z przodu uniesione, dalej zaczesane do tyłu
  const top = h.regionVerts('scalp').map(i => new THREE.Vector3(h.pos[i * 3], h.pos[i * 3 + 1], h.pos[i * 3 + 2]));
  const maxY = Math.max(...top.map(p => p.y));
  const hm = h.mat(C.hair); const rng = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
  const cand = top.filter(p => p.y > maxY - .045 && Math.abs(p.x) < .045);
  for (let k = 0; k < cand.length; k += 2) {
    const p = cand[k]; const front = THREE.MathUtils.clamp((p.z - hp.z) / .1, -1, 1);
    const len = (.018 + rng() * .014) * v.spikes * (1.1 + front * .5);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.0075, len, 5), hm);
    cone.position.copy(p).sub(hp); cone.position.y += len * .3;
    cone.rotation.set(-.35 + front * .5 - .35 * (1 - front), rng() * .5, (p.x / .05) * -.6);
    head.add(cone);
  }
  if (v.headScale !== 1) { head.scale.setScalar(v.headScale); h.bones['neck01'].scale.setScalar(1 + (v.headScale - 1) * .4); }
  // łańcuszek
  const chain = new THREE.Mesh(new THREE.TorusGeometry(.068, .0022, 6, 40), h.mat(C.chain)); chain.rotation.x = Math.PI / 2 - .35;
  const nb = h.bones['neck01']; chain.position.set(0, -.03, .012); chain.scale.set(1.15, 1.25, 1); nb.add(chain);
  // poza
  const B = h.bones;
  if (v.pose === 'thumb') { h.aim('upperarm01.R', new THREE.Vector3(-1, .15, .35)); h.aim('lowerarm01.R', new THREE.Vector3(-.15, 1, .15)); }
  if (v.pose === 'clip') {
    h.aim('upperarm01.L', new THREE.Vector3(.3, -1, .3)); h.aim('lowerarm01.L', new THREE.Vector3(-.15, .3, 1));
    const clip = new THREE.Group(); clip.add(new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .012), h.mat('#8a6a43')), new THREE.Mesh(new THREE.BoxGeometry(.18, .24, .004), h.mat('#f3ede0')));
    (clip.children[1] as THREE.Mesh).position.z = .008; clip.add(new THREE.Mesh(new THREE.BoxGeometry(.08, .03, .02), h.mat('#9aa1a6'))); clip.children[2].position.set(0, .14, .01);
    const w = B['wrist.L']; clip.position.set(-.02, -.08, .06); clip.rotation.set(-1.1, 0, .2); w.add(clip);
  }
}

function main() {
  const meta = HUMAN_JSON as HumanAsset['meta'];
  const bin = Uint8Array.from(atob(HUMAN_BIN), c => c.charCodeAt(0));
  const asset = new HumanAsset(meta, bin.buffer);
  const grid = document.getElementById('grid')!;
  const views: { r: THREE.WebGLRenderer; o: OutlineEffect; scene: THREE.Scene; cam: THREE.PerspectiveCamera; h: HumanBuild; st: { mode: string; rot: number; drag: number | null; y: number; d: number }; view: HTMLElement; faceY: number }[] = [];
  for (const v of VARIANTS) {
    const card = document.createElement('article'); card.className = 'card';
    card.innerHTML = `<div class="view"><span class="badge">${v.id}</span><div class="tog"><button type="button" data-m="face" aria-pressed="true">Twarz</button><button type="button" data-m="full" aria-pressed="false">Cała postać</button></div></div><div class="body"><h2></h2><p></p><div class="chips"></div></div>`;
    card.querySelector('h2')!.textContent = v.name; card.querySelector('p')!.textContent = v.desc;
    for (const c of v.chips) { const s = document.createElement('span'); s.textContent = c; card.querySelector('.chips')!.appendChild(s); }
    grid.appendChild(card);
    const view = card.querySelector('.view') as HTMLElement;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.shadowMap.enabled = true;
    view.prepend(r.domElement);
    const o = new OutlineEffect(r, { defaultThickness: .0032, defaultColor: [.09, .07, .05], defaultAlpha: .95 });
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xdde6f0, 0x5a4a3c, 1.3));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.3); key.position.set(1.6, 3, 2.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0004; key.shadow.normalBias = .015; Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -.2, near: .5, far: 8 }); scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(-2, 2, -2); scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe8d8, .9); fill.position.set(-2.2, 1.2, 2.4); scene.add(fill);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.6, .64, .04, 40), new THREE.MeshToonMaterial({ color: '#2e3134', gradientMap: grad })); disc.position.y = -.02; disc.receiveShadow = true; scene.add(disc);
    // najpierw szkic, żeby poznać czubek głowy
    const probe = buildHuman(asset, v.shape, { skin: C.skin, eyeColor: C.eye, shells: [], gradientMap: grad });
    const sc = probe.regionVerts('scalp'); let headTop = 0; for (const i of sc) headTop = Math.max(headTop, probe.pos[i * 3 + 1]); const hipTop = probe.joint('spine03____head').y - .02; probe.dispose();
    const h = buildHuman(asset, v.shape, { skin: C.skin, eyeColor: C.eye, shells: shells(v, headTop, hipTop), gradientMap: grad, extras: b => addExtras(b, v) });
    scene.add(h.group);
    const hp = new THREE.Vector3(); h.group.updateMatrixWorld(true); h.bones['head'].getWorldPosition(hp);
    const cam = new THREE.PerspectiveCamera(30, 4 / 3, .05, 50);
    const st = { mode: location.hash.includes('full') ? 'full' : 'face', rot: location.hash.includes('side') ? 1.35 : .3, drag: null as number | null, y: 0, d: 0 };
    card.querySelectorAll<HTMLButtonElement>('.tog button').forEach(b => b.onclick = () => { st.mode = b.dataset.m!; card.querySelectorAll('.tog button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    view.addEventListener('pointerdown', e => { st.drag = e.clientX; view.setPointerCapture(e.pointerId); });
    view.addEventListener('pointermove', e => { if (st.drag !== null) { st.rot += (e.clientX - st.drag) * .012; st.drag = e.clientX; } });
    const end = () => { st.drag = null; }; view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
    views.push({ r, o, scene, cam, h, st, view, faceY: hp.y + .08 * v.headScale });
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const w = window as unknown as { __frames: number }; w.__frames = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    for (const { r, o, scene, cam, h, st, view, faceY } of views) {
      const W = view.clientWidth, H = view.clientHeight;
      if (W && H && (r.domElement.width !== Math.floor(W * r.getPixelRatio()) || r.domElement.height !== Math.floor(H * r.getPixelRatio()))) { r.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix(); }
      const f = st.mode === 'face'; const ty = f ? faceY : h.height * .55, td = f ? .95 : 4.2;
      st.y += (ty - st.y) * (st.y ? .12 : 1); st.d += (td - st.d) * (st.d ? .12 : 1);
      cam.position.set(Math.sin(.1) * st.d, st.y + (f ? .02 : .2), Math.cos(.1) * st.d); cam.lookAt(0, st.y, 0);
      if (st.drag === null && !reduce) st.rot += .004; h.group.rotation.y = st.rot;
      o.render(scene, cam);
    }
    w.__frames++;
  };
  loop();
}
main();
