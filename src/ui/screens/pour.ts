import * as THREE from 'three';
import { h } from '../dom';
import { Materials } from '../../game/render/materials';
import { Builder, V, setSeg } from '../../game/render/build';
import { PourSim, NX, NZ, type PourResult } from '../../game/pour/pourSim';
import { modelById, type ModelDef } from '../../data/models';
import { metalById } from '../../data/metals';
import type { EventBus } from '../../core/events';
import type { Balance } from '../../core/balance';

/**
 * Ekran sypania przy mieszarce: model z góry, przyciski Start / Pauza / Wyładuj,
 * czas od Start, przekrój modelu, tabela metali z licznikami podbić, haki.
 * Stan sypania każdego stanowiska jest pamiętany – można odejść i wrócić.
 */
interface Saved { sim: PourSim; closedAt: number }

export class PourController {
  private saved = new Map<string, Saved>();
  private screen: PourScreen | null = null;
  private off: (() => void)[] = [];

  constructor(private wrap: HTMLElement, private bus: EventBus, private balance: Balance, private lowQ: boolean) {
    this.off.push(bus.on('pour:open', ({ stationId, loadId, modelId }) => this.open(stationId, loadId, modelId)));
  }

  private open(stationId: string, loadId: string, modelId: string) {
    if (this.screen) return;
    const def = modelById(modelId); if (!def) { this.bus.emit('toast', { text: 'Nieznany model – brak danych w katalogu.', kind: 'bad' }); return; }
    // stan sypania pamiętany dla każdego modelu osobno (na rolotoku mogą stać 3)
    let s = this.saved.get(loadId);
    if (!s) { s = { sim: new PourSim(def, this.balance.pour), closedAt: 0 }; this.saved.set(loadId, s); }
    else if (s.closedAt) { // czas, gdy gracza nie było przy maszynie (maszyna stała na pauzie)
      let away = (performance.now() - s.closedAt) / 1000; while (away > 0) { const d = Math.min(.25, away); s.sim.step(d); away -= d; }
    }
    this.bus.emit('game:pause', { paused: true });
    this.screen = new PourScreen(this.wrap, s.sim, this.bus, this.lowQ, stationId, (result) => {
      if (result) {
        const hooks = s!.sim.hooks.filter(hk => hk.placed).map(hk => ({ x: hk.x, z: hk.z, ok: hk.depthOk }));
        this.saved.delete(loadId); this.bus.emit('pour:finished', { stationId, loadId, modelId, points: result.points, breakdown: result.breakdown, hooks });
      } else { const sv = this.saved.get(loadId); if (sv) sv.closedAt = performance.now(); }
      this.screen = null; this.bus.emit('game:pause', { paused: false }); this.bus.emit('pour:closed', { stationId });
    });
  }

  dispose() { this.screen?.close(null); this.off.forEach(f => f()); }
}

class PourScreen {
  private el: HTMLElement;
  private renderer: THREE.WebGLRenderer; private scene = new THREE.Scene(); private cam: THREE.PerspectiveCamera;
  private mats: Materials; private b: Builder;
  private joy = { x: 0, y: 0 }; private frameK = 0;
  private panels: HTMLElement[] = [];
  private sandGeo: THREE.PlaneGeometry; private model = new THREE.Group();
  private funnel = new THREE.Group(); private armMesh: THREE.Mesh; private stream: THREE.Mesh;
  private hookMeshes: THREE.Object3D[] = [];
  private raf = 0; private last = performance.now();
  private ui: Record<string, HTMLElement> = {};
  private tapEls: HTMLButtonElement[] = []; private hookEls: HTMLButtonElement[] = [];
  private xsec: HTMLCanvasElement;
  private keys = new Set<string>();
  private offKeys: () => void;
  private lastMsg = new Map<string, number>();

  constructor(parent: HTMLElement, private sim: PourSim, private bus: EventBus, lowQ: boolean, stationId: string, private onClose: (r: PourResult | null) => void) {
    const def = sim.def;
    this.mats = new Materials(lowQ); this.b = new Builder(this.mats);
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowQ, preserveDrawingBuffer: new URLSearchParams(location.search).has('zrzut') });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowQ ? 1.25 : 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x2a221b);
    this.scene.add(new THREE.HemisphereLight(0xffe2bd, 0x6a4b30, 1.6));
    const sun = new THREE.DirectionalLight(0xffcf96, 2.8); sun.position.set(-1.5, 4, 1.2); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2 }); this.scene.add(sun);
    this.cam = new THREE.PerspectiveCamera(38, 1, .05, 50);

    this.buildModel(def);
    this.sandGeo = new THREE.PlaneGeometry(def.inner.l, def.inner.w, NX - 1, NZ - 1); this.sandGeo.rotateX(-Math.PI / 2);
    this.sandGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NX * NZ * 3).fill(1), 3));
    const sandMat = new THREE.MeshStandardMaterial({ map: this.mats.tex.sand, color: 0xa39d95, vertexColors: true, roughness: .95 });
    const sand = new THREE.Mesh(this.sandGeo, sandMat); sand.position.y = .06; sand.receiveShadow = true; this.model.add(sand);
    // ramię mieszarki i lej
    this.armMesh = this.b.seg('blue', .1); this.scene.add(this.armMesh);
    this.funnel.add(this.b.cyl(.16, .06, .3, 'blue', [0, .15, 0]), this.b.cyl(.065, .065, .08, 'dark', [0, -.02, 0]));
    this.scene.add(this.funnel);
    this.stream = this.b.seg('sand', .03); this.stream.visible = false; this.scene.add(this.stream);

    // ===== interfejs =====
    const touch = document.body.classList.contains('touch');
    const btn = (cls: string, text: string, fn: () => void) => h('button', { class: 'mbtn ' + cls, type: 'button', text, onclick: fn });
    this.ui.timer = h('div', { class: 'timer num', text: '00:00' });
    this.ui.state = h('div', { class: 'mstate' });
    this.ui.pauseBar = h('i'); this.ui.pauseTxt = h('span', { class: 'num' });
    this.ui.warn = h('div', { class: 'warn', hidden: true });
    this.ui.metals = h('table', { class: 'mtable' });
    this.ui.fill = h('span', { class: 'num' });
    this.ui.finish = h('button', { class: 'btn pri', type: 'button', text: 'Zakończ sypanie', onclick: () => this.finish() });
    this.ui.hint = h('div', { class: 'phint' });
    this.xsec = h('canvas', { class: 'xsec', width: 320, height: 170 });
    const tagLayer = h('div', { class: 'ptags' });
    const metalNames = def.metals.map(m => `${m.metalId}`);
    sim.metals.forEach((m, k) => { const e = h('button', { class: 'tap', type: 'button', 'aria-label': `Podbij metal ${metalNames[k]} (${m.slot})`, onclick: (ev: Event) => { ev.stopPropagation(); this.tap(k); } }); tagLayer.append(e); this.tapEls.push(e); });
    sim.hooks.forEach((_, k) => { const e = h('button', { class: 'hookmk', type: 'button', 'aria-label': 'Wstaw hak', text: 'Ω', onclick: (ev: Event) => { ev.stopPropagation(); this.hook(k); } }); tagLayer.append(e); this.hookEls.push(e); });

    const canvasBox = h('div', { class: 'pcanvas' }, this.renderer.domElement, tagLayer);
    // gałka ramienia mieszarki (lewy dół) – palec nie zasłania modelu, który jest w prawym dole
    const knob = h('i'); const joy = h('div', { class: 'pjoy', 'aria-label': 'Ramię mieszarki – gałka' }, knob, h('span', { class: 'pjoy-lbl', text: 'Ramię' }));
    let pid = -1; const R = 50;
    const setJoy = (e: PointerEvent) => { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / R, y = (e.clientY - r.top - r.height / 2) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } knob.style.transform = `translate(${x * R}px,${y * R}px)`; this.joy.x = x; this.joy.y = y; };
    joy.addEventListener('pointerdown', e => { pid = e.pointerId; joy.setPointerCapture(pid); setJoy(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === pid) setJoy(e); });
    const endJoy = () => { pid = -1; knob.style.transform = ''; this.joy.x = this.joy.y = 0; };
    joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
    const metalsBox = h('details', { class: 'pmetals' }, h('summary', { text: `Metale w modelu (${sim.metals.length})` }), this.ui.metals,
      h('div', { class: 'dim small', text: `Brak podbić: ${sim.bal.tapPenalty.map(p => '−' + p).join(' / ')} pkt` }));
    const left = h('section', { class: 'panel ptop' },
      h('div', { class: 'row' }, h('span', { class: 'eyebrow', text: `${def.number} · ${stationId.replace('st', 'stanowisko ')}` }), this.ui.fill),
      h('div', { class: 'row tline' }, this.ui.timer, this.ui.state), this.ui.hint,
      h('div', { class: 'pxsec' }, this.xsec), metalsBox,
      h('div', { class: 'pacts' }, h('button', { class: 'btn', type: 'button', text: 'Wróć na halę', onclick: () => this.close(null) }), this.ui.finish));
    const right = h('section', { class: 'panel pmachine' },
      h('div', { class: 'mbtns' }, btn('start', 'Start', () => this.msg(sim.start())), btn('pause', 'Pauza', () => this.msg(sim.pause())), btn('unload', 'Wyładuj', () => this.msg(sim.unload()))),
      h('div', { class: 'row small' }, h('span', { class: 'dim', text: 'Pauza (maks.)' }), this.ui.pauseTxt), h('div', { class: 'bar' }, this.ui.pauseBar), this.ui.warn);
    this.panels = [left, right];
    this.el = h('div', { class: 'screen pour' }, canvasBox, left, right, joy,
      !touch ? h('div', { class: 'pkeys dim small', text: 'W A S D / gałka: ramię · Spacja: Start/Pauza · Esc: wróć' }) : null);
    parent.append(this.el);
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); this.keys.add(k);
      if (k === 'escape') { e.preventDefault(); this.close(null); }
      if (k === ' ' && !e.repeat) { e.preventDefault(); this.msg(sim.machine === 'sypie' || sim.machine === 'start' ? sim.pause() : sim.start()); }
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    addEventListener('keydown', kd, true); addEventListener('keyup', ku, true);
    this.offKeys = () => { removeEventListener('keydown', kd, true); removeEventListener('keyup', ku, true); };
    if (new URLSearchParams(location.search).has('zrzut')) (window as unknown as { __pour: PourScreen }).__pour = this; // testy automatyczne
    this.loop();
  }

  private buildModel(def: ModelDef) {
    const b = this.b, g = this.model; this.scene.add(g);
    const { l, w, h: H } = def.inner, t = .06;
    g.add(b.box(l + 2 * t + .08, .06, w + 2 * t + .08, 'green', [0, .03, 0]));
    g.add(b.box(l + 2 * t, H, t, 'green', [0, .06 + H / 2, w / 2 + t / 2]), b.box(l + 2 * t, H, t, 'green', [0, .06 + H / 2, -w / 2 - t / 2]));
    g.add(b.box(t, H, w, 'green', [l / 2 + t / 2, .06 + H / 2, 0]), b.box(t, H, w, 'green', [-l / 2 - t / 2, .06 + H / 2, 0]));
    // podłoga hali i rolotok pod modelem
    const floor = b.box(6, .02, 5, 'floor', [0, -.5, 0]); g.add(floor);
    for (let x = -1.1; x <= 1.1; x += .25) g.add(b.cyl(.04, .04, 1.3, 'steel', [x, -.04, 0], [Math.PI / 2, 0, 0], 8));
    for (const p of def.pattern) {
      if (p.kind === 'halfCyl') { const m = b.mesh(new THREE.CylinderGeometry(p.r, p.r, p.len, 24, 1, false, 0, Math.PI), p.color, [p.x, .06, p.z]); if (p.axis === 'x') m.rotation.z = Math.PI / 2; else { m.rotation.x = Math.PI / 2; m.rotation.z = Math.PI / 2; } g.add(m); }
      else if (p.kind === 'cyl') g.add(b.cyl(p.r, p.r, p.h, p.color, [p.x, .06 + p.h / 2, p.z], undefined, 20));
      else g.add(b.box(p.w, p.h, p.d, p.color, [p.x, .06 + p.h / 2, p.z]));
    }
    for (const m of def.metals) { const md = metalById(m.metalId); const s = md?.size ?? [.12, .08, .1]; g.add(b.box(s[0], s[2], s[1], 'chill', [m.x, .06 + s[2] / 2, m.z])); }
  }

  private msg(text: string | null, kind: 'ok' | 'bad' | 'info' = 'info') {
    if (!text) return; const now = performance.now(); if ((this.lastMsg.get(text) ?? 0) > now - 1500) return; this.lastMsg.set(text, now);
    this.bus.emit('toast', { text, kind });
  }
  private tap(k: number) { const r = this.sim.tapMetal(k); this.msg(r.msg, r.ok ? 'ok' : 'bad'); if (r.ok) { const e = this.tapEls[k]; e.classList.remove('hit'); void e.offsetWidth; e.classList.add('hit'); } }
  private hook(k: number) {
    const r = this.sim.placeHook(k); this.msg(r.msg, r.ok ? 'ok' : 'bad');
    if (r.ok) { const hk = this.sim.hooks[k]; const m = this.hookMesh(); m.position.set(hk.x, .06 + this.sim.surface(hk.x, hk.z) - .2, hk.z); this.model.add(m); this.hookMeshes.push(m); }
  }
  private hookMesh() {
    const c = new THREE.CatmullRomCurve3([V(-.04, 0, 0), V(-.04, .22, 0), V(-.065, .28, 0), V(-.045, .33, 0), V(0, .35, 0), V(.045, .33, 0), V(.065, .28, 0), V(.04, .22, 0), V(.04, 0, 0)]);
    const m = this.b.mesh(new THREE.TubeGeometry(c, 40, .009, 8), 'steel'); m.rotation.y = Math.PI / 2; return m;
  }

  private finish() {
    if (!this.sim.canFinish()) { this.msg(this.sim.machine === 'sypie' || this.sim.machine === 'start' ? 'Najpierw zatrzymaj masę (Pauza).' : 'Model nie jest jeszcze zasypany do pełna.', 'bad'); return; }
    const r = this.sim.finish();
    const rows = r.breakdown.map(x => h('tr', {}, h('td', { text: x.label }), h('td', { class: x.pts < 0 ? 'neg' : 'pos', text: (x.pts > 0 ? '+' : '') + x.pts })));
    const modal = h('div', { class: 'pmodal' }, h('div', { class: 'panel' },
      h('div', { class: 'eyebrow', text: 'Forma zasypana' }), h('div', { class: 'title', text: `${this.sim.def.number} · ${Math.round(r.timeSec)} s` }),
      h('table', { class: 'sumtab' }, ...rows, h('tr', { class: 'tot' }, h('td', { text: 'Razem' }), h('td', { text: (r.points > 0 ? '+' : '') + r.points + ' pkt' }))),
      h('p', { class: 'dim small', text: 'Forma zostaje w modelu. Na hali weź pilota suwnicy, zaczep za haki formy i wyciągnij ją powoli, trzymając poziom.' }),
      h('button', { class: 'btn pri wide', type: 'button', text: 'Zapisz wynik i wróć na halę', onclick: () => this.close(r) })));
    this.el.append(modal);
  }

  close(result: PourResult | null) {
    if (!this.el.isConnected) return;
    cancelAnimationFrame(this.raf); this.offKeys();
    this.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.mats.dispose(); this.renderer.dispose(); this.el.remove();
    this.onClose(result);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(); const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    const s = this.sim;
    // klawiatura przesuwa cel ramienia
    const kx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const kz = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    const jx = kx + this.joy.x, jz = kz + this.joy.y;
    if (jx || jz) s.setArmTarget(s.arm.tx + jx * s.bal.armSpeed * dt * 1.2, s.arm.tz + jz * s.bal.armSpeed * dt * 1.2);
    s.step(dt);
    this.render3d(); this.updateUi();
    (window as unknown as { __frames: number }).__frames = ((window as unknown as { __frames: number }).__frames || 0) + 1;
  };

  private render3d() {
    const s = this.sim, def = s.def, H = def.inner.h;
    const box = this.renderer.domElement.parentElement!; const w = box.clientWidth, hh = box.clientHeight;
    if (w && hh && (this.renderer.domElement.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.renderer.domElement.height !== Math.floor(hh * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, hh, false); this.cam.aspect = w / hh; this.cam.updateProjectionMatrix();
    }
    this.frame(w, hh);
    // piasek
    const pos = this.sandGeo.attributes.position as THREE.BufferAttribute, col = this.sandGeo.attributes.color as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const i = Math.round((pos.getX(v) + def.inner.l / 2) / s.dx), j = Math.round((pos.getZ(v) + def.inner.w / 2) / s.dz); const c = j * NX + i;
      const hgt = s.sand[c]; pos.setY(v, hgt < .002 ? s.base[c] - .012 : s.base[c] + hgt);
      const weak = hgt > 0 ? Math.min(1, s.weak[c] / hgt) : 0; const k = 1 + weak * .9; col.setXYZ(v, k, k * .97, k * .9);
    }
    pos.needsUpdate = true; col.needsUpdate = true; this.sandGeo.computeVertexNormals();
    // ramię i lej
    const fy = H + .55; this.funnel.position.set(s.arm.x, fy, s.arm.z);
    setSeg(this.armMesh, V(-def.inner.l / 2 - 1.2, fy + .35, -def.inner.w / 2 - .9), V(s.arm.x, fy + .3, s.arm.z));
    const flowing = s.machine === 'sypie';
    if (flowing) setSeg(this.stream, V(s.arm.x, fy - .05, s.arm.z), V(s.arm.x, s.armOverModel() ? .06 + s.surface(s.arm.x, s.arm.z) : -.5, s.arm.z)); else this.stream.visible = false;
    this.renderer.render(this.scene, this.cam);
  }

  /**
   * Kadr: przed Start model na środku, po Start cały model w prawym dolnym rogu ekranu
   * (z lewej gałka ramienia, u góry panele) – kamera dobiera odległość, a przesunięcie robi setViewOffset.
   */
  private frame(W: number, H: number) {
    const s = this.sim, def = s.def;
    this.frameK += ((s.started ? 1 : 0) - this.frameK) * .08;
    const k = this.frameK;
    const box = this.renderer.domElement.parentElement!.getBoundingClientRect();
    let top = 0, leftW = 0, leftB = 0;
    for (const p of this.panels) { const r = p.getBoundingClientRect(); top = Math.max(top, r.bottom - box.top); }
    { const r = this.panels[0].getBoundingClientRect(); leftW = r.right - box.left; leftB = r.bottom - box.top; }
    const portrait = W < H * 1.05;
    // obszar docelowy (piksele): przed Start – środek; po Start – prawy dół
    const A = portrait ? { x0: 8, x1: W - 8, y0: top + 8, y1: H * .82 } : { x0: leftW + 12, x1: W - 12, y0: top + 8, y1: H - 12 };
    const B = portrait ? { x0: W * .3, x1: W - 6, y0: Math.max(top, leftB) + 6, y1: H - 6 } : { x0: Math.max(W * .42, leftW + 12), x1: W - 8, y0: Math.max(H * .3, Math.min(top, H * .45)) + 6, y1: H - 8 };
    const R = { x0: A.x0 + (B.x0 - A.x0) * k, x1: A.x1 + (B.x1 - A.x1) * k, y0: A.y0 + (B.y0 - A.y0) * k, y1: A.y1 + (B.y1 - A.y1) * k };
    const rw = Math.max(80, R.x1 - R.x0), rh = Math.max(80, R.y1 - R.y0);
    const hx = def.inner.l / 2 + .14, hz = def.inner.w / 2 + .14, Ht = def.inner.h + .1;
    const corners = [-1, 1].flatMap(a => [-1, 1].flatMap(b => [0, Ht].map(y => V(a * hx, y, b * hz))));
    const dir = V(0, 2.5, 1.25).normalize(); let d = 3;
    this.cam.clearViewOffset(); this.cam.aspect = W / H;
    let cx = 0, cy = 0;
    for (let it = 0; it < 4; it++) {
      this.cam.position.copy(dir).multiplyScalar(d); this.cam.lookAt(0, .25, 0); this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of corners) { const v = c.clone().project(this.cam); const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
      const f = Math.max((x1 - x0) / rw, (y1 - y0) / rh); d *= f * 1.04; cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
    }
    this.cam.position.copy(dir).multiplyScalar(d); this.cam.lookAt(0, .25, 0); this.cam.updateMatrixWorld();
    { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const c of corners) { const v = c.clone().project(this.cam); const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); } cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; }
    // środek modelu przesuwamy na środek obszaru
    this.cam.setViewOffset(W, H, cx - (R.x0 + R.x1) / 2, cy - (R.y0 + R.y1) / 2, W, H);
  }

  private project(x: number, y: number, z: number) {
    const v = V(x, y, z).project(this.cam); const box = this.renderer.domElement.parentElement!;
    return { x: (v.x + 1) / 2 * box.clientWidth, y: (1 - v.y) / 2 * box.clientHeight };
  }

  private updateUi() {
    const s = this.sim;
    const mm = Math.floor(s.t / 60), ss = Math.floor(s.t % 60); this.ui.timer.textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const st = s.machine === 'start' ? `Start – masa za ${Math.max(0, s.delay).toFixed(1).replace('.', ',')} s` : s.machine === 'sypie' ? (s.armOverModel() ? '● Masa leci' : '● Masa leci obok modelu!') : s.machine === 'pauza' ? 'Pauza' : s.machine === 'wyladunek' ? `Wyładunek… ${Math.max(0, s.unloadT).toFixed(1).replace('.', ',')} s` : s.started ? 'Maszyna stoi' : 'Ustaw ramię nad modelem i wciśnij Start';
    this.ui.state.textContent = st; this.ui.state.className = 'mstate ' + (s.machine === 'sypie' ? (s.armOverModel() ? 'ok' : 'bad') : '');
    const p = s.machine === 'pauza' ? s.pauseT : 0; this.ui.pauseTxt.textContent = `${Math.floor(p)} / ${s.bal.maxPauseSec} s`;
    this.ui.pauseBar.style.width = Math.min(100, p / s.bal.maxPauseSec * 100) + '%'; this.ui.pauseBar.parentElement!.classList.toggle('bad', p > s.bal.maxPauseSec * .7);
    this.ui.warn.hidden = !s.massWeak; this.ui.warn.textContent = 'Masa za długo stała – jest słaba i będzie się rozsypywać. Wyładuj ją przed dalszym sypaniem.';
    // tabela metali
    const rows = s.metals.map(m => { const md = metalById(m.metalId); const cls = m.taps >= m.need ? 'ok' : m.buried ? 'bad' : ''; return `<tr><td>${m.metalId} · ${md?.weightKg.toString().replace('.', ',') ?? '?'} kg · ${m.slot}</td><td class="${cls}">${m.taps}/${m.need}</td></tr>`; }).join('');
    if (this.ui.metals.innerHTML !== rows) this.ui.metals.innerHTML = rows;
    // znaczniki podbić i haków
    s.metals.forEach((m, k) => {
      const e = this.tapEls[k]; const q = this.project(m.x, .06 + Math.max(m.top, s.surface(m.x, m.z)) + .02, m.z); e.style.transform = `translate(${q.x}px,${q.y}px)`;
      const lvl = s.sandLevelNear(m.x, m.z); const now = !m.buried && m.taps < m.need && lvl >= m.top * .6;
      e.textContent = `${m.taps}/${m.need}`; e.className = 'tap' + (m.taps >= m.need ? ' ok' : m.buried ? ' bad' : now ? ' now' : '');
    });
    s.hooks.forEach((hk, k) => {
      const e = this.hookEls[k]; const q = this.project(hk.x, .06 + s.surface(hk.x, hk.z) + .02, hk.z); e.style.transform = `translate(${q.x}px,${q.y}px)`;
      const lvl = s.surface(hk.x, hk.z); const [lo, hi] = s.def.hookWindow; e.hidden = hk.placed; e.classList.toggle('now', lvl >= lo && lvl <= hi);
    });
    // przekrój
    this.drawXsec();
    const fill = s.fill(); this.ui.fill.textContent = `${Math.round(fill * 100)}%`;
    (this.ui.finish as HTMLButtonElement).disabled = !s.canFinish();
    const pending = s.metals.some((_, k) => this.tapEls[k].classList.contains('now'));
    const hookNow = s.hooks.some((hk, k) => !hk.placed && this.hookEls[k].classList.contains('now'));
    this.ui.hint.textContent = !s.started ? 'Gałką w lewym dolnym rogu (albo W A S D) ustaw ramię nad modelem i wciśnij Start.'
      : pending ? 'Masa dochodzi do metali – teraz podbijaj (dotknij licznika przy metalu).'
      : hookNow ? 'Teraz wstaw hak Ω (dotknij znacznika).'
      : fill >= .97 ? 'Model pełny – wciśnij Pauzę i Zakończ sypanie.'
      : 'Prowadź ramię nad niższe miejsca, żeby masa rozkładała się równo.';
  }

  private drawXsec() {
    const c = this.xsec, g = c.getContext('2d')!; const W = c.width, Hh = c.height; const s = this.sim, H = s.def.inner.h;
    const x0 = 24, x1 = W - 54, y0 = 16, y1 = Hh - 18; const Y = (v: number) => y1 - v / (H * 1.1) * (y1 - y0);
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = '#5f7f66'; g.fillRect(x0 - 6, y1, x1 - x0 + 12, 6);
    // masa (profil uśredniony)
    const prof = s.profile(); g.beginPath(); g.moveTo(x0, y1);
    prof.forEach((v, i) => g.lineTo(x0 + i / (NX - 1) * (x1 - x0), Y(v * H))); g.lineTo(x1, y1); g.closePath();
    g.fillStyle = '#57514a'; g.fill(); g.strokeStyle = '#b3a898'; g.lineWidth = 1.5; g.stroke();
    // model odlewu (wzór) – przekrój środkiem
    g.fillStyle = 'rgba(200,85,58,.9)'; g.beginPath(); g.moveTo(x0, y1);
    for (let i = 0; i < NX; i++) { const c0 = Math.floor(NZ / 2) * NX + i; g.lineTo(x0 + i / (NX - 1) * (x1 - x0), Y(Math.min(s.base[c0], .4))); }
    g.lineTo(x1, y1); g.closePath(); g.fill();
    // ściany
    g.strokeStyle = '#f3ede0'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, Y(H)); g.moveTo(x1, y1); g.lineTo(x1, Y(H)); g.stroke();
    const line = (v: number, col: string, label: string, dash: number[]) => { g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke(); g.setLineDash([]); g.fillStyle = col; g.font = '600 11px "IBM Plex Mono", monospace'; g.fillText(label, x1 + 6, Y(v) + 4); };
    const mTop = Math.max(...s.metals.map(m => m.top)); line(mTop, '#ffb21f', 'metale', [5, 3]);
    line((s.def.hookWindow[0] + s.def.hookWindow[1]) / 2, 'rgba(243,237,224,.7)', 'haki', [2, 3]);
    line(H, 'rgba(243,237,224,.8)', '100%', []);
  }
}
