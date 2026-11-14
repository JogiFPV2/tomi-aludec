import * as THREE from 'three';
import { InkPass } from './render/ink';
import { Atmosphere, paperOverlay } from './render/atmosphere';
import { Materials } from './render/materials';
import { Builder, V } from './render/build';
import { World } from './world/world';
import { Crane } from './crane/crane';
import { Yard } from './crane/yard';
import { Transport } from './transport/transport';
import { buildAvatar, type Avatar } from './character/avatar';
import { Input } from './input/input';
import type { EventBus } from '../core/events';
import type { Balance } from '../core/balance';
import type { Backend, Character } from '../services/backend';
import { ROOMS, SPAWN, MODELS, STATIONS, SLOT_X, LADLE } from '../data/layout';

export interface GameOptions { container: HTMLElement; backend: Backend; character: Character; balance: Balance; bus: EventBus; lowQuality: boolean }
interface Interactable { id: string; label: string; pos: () => THREE.Vector3; radius: number; use: () => void }
interface Nearby { id: string; label: string; use: () => void }
/** Pochylenie kamery od pionu (widok z góry, lekko „od przodu”). */
const CAM_TILT_DEG = 15, CAM_H = 34;

/** Główny moduł gry: spina świat, postać, suwnicę, kamerę i pętlę. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 200);
  readonly input = new Input();
  readonly world: World;
  readonly cranes: Crane[] = [];
  readonly yard: Yard;
  readonly transport: Transport;
  private hadJack = false;
  private ink: InkPass; private atmo: Atmosphere; private paper: HTMLElement; private craneLights: THREE.PointLight[] = [];
  /** suwnica, której pilota trzyma gracz */
  remote: Crane | null = null;
  private remoteInHand: THREE.Group | null = null;
  /** aktywna suwnica (pilot w ręku) albo pierwsza – dla panelu */
  get crane(): Crane { return this.remote ?? this.cranes[0]; }
  private mats: Materials;
  private sun: THREE.DirectionalLight;
  private avatar: Avatar;
  private player = { x: SPAWN.x, z: SPAWN.z, heading: Math.PI, speed: 0 };
  mode: 'walk' | 'crane' = 'walk';
  zoom = 12; // widoczna wysokość sceny w metrach
  private camTarget = V(); private camPos = V();
  private interactables: Interactable[] = [];
  nearby: Nearby | null = null;
  private raf = 0; private last = performance.now(); private saveT = 0; private running = true; private paused = false; private offBus: () => void; private offPour: () => void;
  room = '';

  constructor(private o: GameOptions) {
    const { container, lowQuality } = o;
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowQuality, powerPreference: 'high-performance', preserveDrawingBuffer: new URLSearchParams(location.search).has('zrzut') });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowQuality ? 1.25 : 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = lowQuality ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.NoToneMapping; // rysunkowo: czyste, płaskie kolory bez filmowego wygaszania
    this.renderer.domElement.className = 'game-canvas'; container.prepend(this.renderer.domElement);
    // kontur tuszem (ciepły brąz zamiast czerni) i papierowe ziarno z winietą
    this.ink = new InkPass(this.renderer, lowQuality);
    this.paper = paperOverlay(); this.renderer.domElement.after(this.paper);

    // ciepłe, „malowane” światło: złote słońce przez okna + ciepłe odbicia od podłogi
    // półmrok hali: chłodne, fioletowe cienie + ciepłe plamy światła (okna, lampy, żar z kadzi)
    this.scene.background = new THREE.Color(0x1a1420);
    this.scene.add(new THREE.HemisphereLight(0xfff0dc, 0x6a5a9a, 1.25));
    this.scene.add(new THREE.AmbientLight(0x8f86b8, .45));
    this.sun = new THREE.DirectionalLight(0xffd9aa, 1.7); this.sun.castShadow = true; this.sun.shadow.radius = 3;
    const sz = lowQuality ? 1024 : 2048; this.sun.shadow.mapSize.set(sz, sz);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); this.sun.shadow.bias = -.0005; this.sun.shadow.normalBias = .03;
    this.scene.add(this.sun, this.sun.target, this.camera);

    this.mats = new Materials(lowQuality);
    const b = new Builder(this.mats);
    this.world = new World(b); this.scene.add(this.world.group);
    this.yard = new Yard(b); this.scene.add(this.yard.group);
    for (const m of MODELS) this.yard.addModel(m);
    this.transport = new Transport(b, this.yard, this.world.col, o.balance.transport, o.bus); this.scene.add(this.transport.group);
    this.yard.palletTopAt = (x, z) => this.transport.palletTopAt(x, z);
    for (const st of STATIONS) { const c = new Crane(b, o.bus, this.yard, (x, z) => Math.max(this.world.supportAt(x, z), this.transport.supportAt(x, z)), st, o.balance); this.cranes.push(c); this.scene.add(c.group); }
    this.offPour = o.bus.on('pour:finished', r => { const l = this.yard.loads.find(x => x.id === r.loadId); if (l) this.yard.fillModel(l, { hooks: r.hooks, seed: Math.floor(Math.random() * 1e9), points: r.points }); });
    this.atmo = new Atmosphere(b, lowQuality); this.scene.add(this.atmo.group); this.world.col.addCircle({ x: LADLE.x, z: LADLE.z, r: 1 }); this.world.labels.push({ text: 'Kadź z aluminium', pos: V(LADLE.x, 1.9, LADLE.z) });
    if (!lowQuality) for (const c of this.cranes) { const l = new THREE.PointLight(new THREE.Color(c.station.color), 4, 6, 1.6); this.scene.add(l); this.craneLights.push(l); }
    this.avatar = buildAvatar(b, o.character.appearance, o.lowQuality); this.avatar.setHelmet(true); this.scene.add(this.avatar.group);

    const lp = o.character.last_position;
    if (lp && Number.isFinite(lp.x) && Number.isFinite(lp.z)) { const p = this.world.col.resolve(lp.x, lp.z, .3); this.player.x = p.x; this.player.z = p.z; }
    this.setupInteractables();
    this.input.onAction(a => this.onAction(a));
    this.updateCamera(1, true);
    addEventListener('resize', this.onResize); this.onResize();
    this.wheel = (e: WheelEvent) => { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY > 0 ? 1.1 : 1 / 1.1)); };
    this.renderer.domElement.addEventListener('wheel', this.wheel, { passive: false });
    document.addEventListener('visibilitychange', this.onHide);
    this.offBus = o.bus.on('game:pause', ({ paused }) => { this.paused = paused; this.last = performance.now(); this.input.reset(); });
    this.loop();
  }
  private wheel: (e: WheelEvent) => void;

  setZoom(z: number) { this.zoom = Math.min(22, Math.max(6, z)); this.onResize(); }

  private setupInteractables() {
    const bus = this.o.bus;
    for (const c of this.cranes) this.interactables.push({
      id: 'remote-' + c.station.id, radius: 1.3, pos: () => c.standPos,
      get label() { return '' },
      use: () => this.takeOrReturnRemote(c),
    });
    // etykieta zależna od stanu (weź / odłóż)
    for (const it of this.interactables) if (it.id.startsWith('remote-')) { const c = this.cranes.find(x => 'remote-' + x.station.id === it.id)!; Object.defineProperty(it, 'label', { get: () => this.remote === c ? `Odłóż pilota (${c.name})` : c.remoteTaken ? `Pilot ${c.station.colorName} jest u kogoś` : `Weź pilota – ${c.name}` }); }
    this.interactables.push({ id: 'locker', label: 'Twoja szafka', radius: 1.2, pos: () => V(-6.3, 0, 23.9), use: () => bus.emit('toast', { text: 'Szafka: ubrania robocze i kaski odblokujesz za punkty (w kolejnym etapie).' }) });
    this.interactables.push({ id: 'board', label: 'Tablica ogłoszeń', radius: 1.4, pos: () => V(-5, 0, 13.8), use: () => bus.emit('toast', { text: 'Plan zmiany: 8 form KP-180 na stanowisku 1. Uwaga: kontrola BHP w tym tygodniu!' }) });
    this.interactables.push({ id: 'vending', label: 'Automat z napojami', radius: 1.3, pos: () => V(-8.8, 0, 14.4), use: () => bus.emit('toast', { text: 'Automat z napojami – przerwy w jadalni dodamy w kolejnym etapie.' }) });
    for (const m of this.world.mixers) this.interactables.push({ id: 'mixer', label: 'Mieszarka – sypanie', radius: 1.4, pos: () => V(m.x + .7, 0, m.z + .9), use: () => {
      const st = STATIONS.find(s => s.id === m.stationId)!;
      // modele na rolotoku po kolei (miejsce 1, 2, 3)
      const onLine = SLOT_X.map(sx => this.yard.loads.find(l => l.kind === 'model' && !l.heldBy && Math.abs(l.x - (st.x + sx)) < .35 && Math.abs(l.z - st.z) < .25 && Math.abs(l.y - .5) < .02));
      const models = onLine.filter(Boolean);
      if (!models.length) { bus.emit('toast', { text: 'Na rolotoku nie ma modelu. Podstaw model suwnicą (maks. 3 modele) i odczep hak.', kind: 'info' }); return; }
      const next = models.find(l => !l!.form);
      if (!next) { bus.emit('toast', { text: 'Wszystkie modele na rolotoku są zasypane. Wyciągnij formy suwnicą (zaczep za haki formy).', kind: 'info' }); return; }
      bus.emit('pour:open', { stationId: m.stationId, loadId: next.id, modelId: next.def.id });
    } });
    this.interactables.push({ id: 'metals', label: 'Pojemnik z metalami', radius: 1.4, pos: () => V(14.5, 0, 13), use: () => bus.emit('toast', { text: 'Przekładanie metali na paletę dodamy w kolejnym etapie.' }) });
  }

  get balance(): Balance { return this.o.balance; }

  craneUnlocked(): boolean { return this.o.balance.devUnlockAll || this.o.character.points >= this.o.balance.crane.unlockPoints; }

  private takeOrReturnRemote(c: Crane) {
    const bus = this.o.bus;
    if (this.remote === c) { this.exitCrane(); c.remoteTaken = false; c.remoteOnStand.visible = true; this.setRemote(null); bus.emit('toast', { text: `Pilot odłożony (${c.name})` }); return; }
    if (c.remoteTaken) { bus.emit('toast', { text: 'Tego pilota ma już ktoś inny.', kind: 'bad' }); return; }
    if (this.remote) { bus.emit('toast', { text: `Masz już pilota (${this.remote.name}). Najpierw go odłóż.`, kind: 'bad' }); return; }
    if (!this.craneUnlocked()) { bus.emit('crane:locked', { needPoints: this.o.balance.crane.unlockPoints, havePoints: this.o.character.points }); return; }
    c.remoteTaken = true; c.remoteOnStand.visible = false; this.setRemote(c);
    bus.emit('toast', { text: `Pilot przy pasie – ${c.name}. Masz go przy sobie, steruj z dowolnego miejsca (C albo „Steruj”).`, kind: 'ok' });
  }
  private setRemote(c: Crane | null) {
    if (this.remoteInHand) { this.avatar.group.remove(this.remoteInHand); this.remoteInHand = null; }
    this.remote = c;
    if (c) { const r = Crane.remoteMesh(new Builder(this.mats), c.colorMat); r.scale.setScalar(1.3); this.avatar.group.add(r); this.remoteInHand = r; this.poseRemote(); }
    this.o.bus.emit('remote:changed', c ? { stationId: c.station.id, color: c.station.color, name: c.name } : null);
  }
  /** Pilot: przy sterowaniu w ręku, poza tym wisi przy pasie (ręce wolne na palety i paleciak). */
  private poseRemote() {
    const r = this.remoteInHand; if (!r) return;
    if (this.mode === 'crane') { r.position.set(.28, .95, .18); r.rotation.set(-.6, 0, 0); } else { r.position.set(.24, .8, -.04); r.rotation.set(Math.PI / 2, 0, -.35); }
  }
  /** Przełącza sterowanie suwnicą (pilot w ręku) ↔ chodzenie. */
  toggleControl() { if (this.mode === 'crane') this.exitCrane(); else this.enterCrane(); }
  enterCrane() {
    if (!this.remote) { this.o.bus.emit('toast', { text: 'Weź pilota suwnicy ze stojaka przy stanowisku.', kind: 'info' }); return; }
    if (this.transport.hand) { this.o.bus.emit('toast', { text: 'Masz zajęte ręce – najpierw odłóż paletę, potem sięgnij po pilota.', kind: 'bad' }); return; }
    this.mode = 'crane'; this.player.speed = 0; this.poseRemote(); this.o.bus.emit('crane:enter', { gear: this.remote.state.gear });
  }
  exitCrane() { if (this.mode !== 'crane') return; this.mode = 'walk'; this.poseRemote(); const c = this.remote; if (c) { c.state.vx = c.state.vz = 0; c.pending = null; } this.o.bus.emit('crane:choice', null); this.o.bus.emit('crane:exit', undefined as never); }

  private onAction(a: string) {
    if (!this.running || this.paused) return;
    if (a === 'control') { this.toggleControl(); return; }
    if (a === 'rotate') { if (this.mode === 'walk') this.transport.rotate(); return; }
    if (a === 'drop') { if (this.mode === 'walk') { this.transport.release(this.player); this.hadJack = !!this.transport.holding; } return; }
    if (this.mode === 'crane' && this.remote) {
      const c = this.remote;
      if (a.startsWith('sel')) { const i = +a.slice(3) - 1; if (c.pending) c.pick(i); else c.selectChain(i); return; }
      if (a === 'attach' || a === 'use') c.toggleAttach();
      if (a === 'gear') c.setGear(c.state.gear === 1 ? 2 : 1);
      if (a === 'exit') this.exitCrane();
      return;
    }
    if ((a === 'use' || a === 'attach') && this.nearby) this.nearby.use();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(); const dt = Math.min(.05, (now - this.last) / 1000); this.last = now;
    if (!this.running || this.paused) return;
    this.update(dt);
    this.ink.render(this.scene, this.camera);
    (window as unknown as { __frames: number }).__frames = ((window as unknown as { __frames: number }).__frames || 0) + 1;
  };

  private update(dt: number) {
    const mv = this.input.move();
    if (this.mode === 'walk') {
      const bp = this.o.balance.player;
      const speed = this.transport.speed(bp.walkSpeed, bp.runSpeed, this.input.running()) * Math.min(1, Math.hypot(mv.x, mv.z));
      const ox = this.player.x, oz = this.player.z;
      let p = this.world.col.move(ox, oz, .3, mv.x * speed * dt, mv.z * speed * dt);
      if (Math.hypot(mv.x, mv.z) > .1) this.player.heading = Math.atan2(mv.x, mv.z);
      // paleciak / palety: widły nie wjeżdżają w ściany, ładunek jedzie z paletą
      const q = this.transport.update(dt, { x: p.x, z: p.z, heading: this.player.heading });
      if (q.x !== p.x || q.z !== p.z) p = this.world.col.resolve(q.x, q.z, .3);
      this.player.speed = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-3);
      this.player.x = p.x; this.player.z = p.z;
      for (const c of this.cranes) c.update(dt, null);
      // najbliższy obiekt do użycia
      let best: Nearby | null = null, bd = 1e9;
      const busy = !!this.transport.holding || this.transport.hand > 0;
      if (!busy) for (const it of this.interactables) { const q = it.pos(); const d = Math.hypot(q.x - this.player.x, q.z - this.player.z); if (d < it.radius && d < bd) { bd = d; best = { id: it.id, label: it.label, use: it.use }; } }
      const ta = this.transport.action(this.player);
      if (ta && ta.dist < bd) best = { id: ta.id, label: ta.label, use: () => { ta.run(); this.afterTransport(); } };
      if (best?.id !== this.nearby?.id || best?.label !== this.nearby?.label) this.o.bus.emit('interact:available', best ? { id: best.id, label: best.label } : null);
      this.nearby = best;
    } else {
      const rc = this.remote!;
      for (const c of this.cranes) c.update(dt, c === rc ? { mx: mv.x, mz: mv.z, hoist: this.input.hoist(), chain: this.input.chain() } : null);
      // operator stoi i patrzy na hak
      const hw = rc.hookWorld(); if (!this.transport.holding) this.player.heading = Math.atan2(hw.x - this.player.x, hw.z - this.player.z); this.player.speed = 0;
      this.transport.update(dt, this.player);
      if (this.nearby) { this.nearby = null; this.o.bus.emit('interact:available', null); }
    }
    // postać
    const g = this.avatar.group; g.position.set(this.player.x, 0, this.player.z);
    let dh = this.player.heading - g.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); g.rotation.y += dh * Math.min(1, dt * 12);
    this.avatar.animate(dt, this.player.speed);
    const room = ROOMS.find(r => this.player.x >= r.x0 && this.player.x <= r.x1 && this.player.z >= r.z0 && this.player.z <= r.z1)?.name ?? '';
    if (room !== this.room) this.room = room;
    this.atmo.update(dt);
    this.craneLights.forEach((l, i) => { const c = this.cranes[i]; l.position.set(c.state.x, 1.9, c.state.z); l.intensity = 3 + Math.min(1, Math.hypot(c.state.vx, c.state.vz)) * 9 * (.6 + .4 * Math.sin(performance.now() / 90)); });
    this.updateCamera(dt);
    this.saveT += dt; if (this.saveT > 15) { this.saveT = 0; this.savePosition(); }
  }

  private updateCamera(dt: number, snap = false) {
    const focus = this.mode === 'crane' && this.remote ? (() => { const h = this.remote.hookWorld(); return V(h.x, 0, h.z); })() : V(this.player.x, 0, this.player.z);
    this.camTarget.lerp(focus, snap ? 1 : 1 - Math.exp(-dt * 5));
    // widok z góry, lekko pochylony (kamera nad i trochę „za” – od strony +z)
    this.camPos.set(this.camTarget.x, CAM_H, this.camTarget.z + CAM_H * Math.tan(CAM_TILT_DEG * Math.PI / 180));
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x - 11, 15, this.camTarget.z - 13); this.sun.target.position.copy(this.camTarget);
  }

  /** Po wzięciu paleciaka gracz staje za dyszlem. */
  private afterTransport() {
    const has = !!this.transport.holding;
    if (has && !this.hadJack) { const g = this.transport.gripPose()!; const p = this.world.col.resolve(g.x, g.z, .3); this.player.x = p.x; this.player.z = p.z; this.player.heading = g.heading; }
    this.hadJack = has;
  }

  private onResize = () => {
    const el = this.o.container; const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; const a = w / h;
    // na wąskim ekranie (telefon pionowo) pokaż więcej w poziomie
    const vh = this.zoom * (a < 1 ? 1.35 : 1);
    this.camera.top = vh / 2; this.camera.bottom = -vh / 2; this.camera.left = -vh / 2 * a; this.camera.right = vh / 2 * a; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); this.ink.setSize(w, h, this.renderer.getPixelRatio(), this.camera);
  };

  private onHide = () => { if (document.visibilityState === 'hidden') this.savePosition(); };
  savePosition() { this.o.backend.updateCharacter({ last_position: { x: +this.player.x.toFixed(2), z: +this.player.z.toFixed(2) } }).catch(() => {}); }

  /** Punkt w świecie → piksele na ekranie (dla etykiet HUD). */
  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera); const el = this.o.container;
    return { x: (v.x + 1) / 2 * el.clientWidth, y: (1 - v.y) / 2 * el.clientHeight, visible: Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }
  playerPos() { return V(this.player.x, 0, this.player.z); }

  dispose() {
    this.running = false; this.offBus(); this.offPour(); this.savePosition(); cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize); document.removeEventListener('visibilitychange', this.onHide);
    this.renderer.domElement.removeEventListener('wheel', this.wheel);
    this.input.dispose(); this.avatar.dispose();
    this.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.mats.dispose(); this.ink.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.paper.remove();
  }
}
