import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { Materials } from './render/materials';
import { Builder, V } from './render/build';
import { World } from './world/world';
import { Crane } from './crane/crane';
import { buildAvatar, type Avatar } from './character/avatar';
import { Input } from './input/input';
import type { EventBus } from '../core/events';
import type { Balance } from '../core/balance';
import type { Backend, Character } from '../services/backend';
import { ROOMS, SPAWN, CRANE_START, MODELS } from '../data/layout';

export interface GameOptions { container: HTMLElement; backend: Backend; character: Character; balance: Balance; bus: EventBus; lowQuality: boolean }
interface Interactable { id: string; label: string; pos: () => THREE.Vector3; radius: number; use: () => void }

/** Główny moduł gry: spina świat, postać, suwnicę, kamerę i pętlę. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 200);
  readonly input = new Input();
  readonly world: World;
  readonly crane: Crane;
  private mats: Materials;
  private outline: OutlineEffect | null;
  private sun: THREE.DirectionalLight;
  private avatar: Avatar;
  private player = { x: SPAWN.x, z: SPAWN.z, heading: Math.PI, speed: 0 };
  mode: 'walk' | 'crane' = 'walk';
  zoom = 12; // widoczna wysokość sceny w metrach
  private camTarget = V(); private camPos = V();
  private interactables: Interactable[] = [];
  nearby: Interactable | null = null;
  private raf = 0; private last = performance.now(); private saveT = 0; private running = true; private paused = false; private offBus: () => void;
  room = '';

  constructor(private o: GameOptions) {
    const { container, lowQuality } = o;
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowQuality, powerPreference: 'high-performance', preserveDrawingBuffer: new URLSearchParams(location.search).has('zrzut') });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowQuality ? 1.25 : 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = lowQuality ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.className = 'game-canvas'; container.prepend(this.renderer.domElement);
    this.outline = new OutlineEffect(this.renderer, { defaultThickness: lowQuality ? .0035 : .0028, defaultColor: [.09, .07, .05], defaultAlpha: .9 });

    this.scene.background = new THREE.Color(0x15161a);
    this.scene.add(new THREE.HemisphereLight(0xc8d4e4, 0x5a4a3c, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4); this.sun.castShadow = true;
    const sz = lowQuality ? 1024 : 2048; this.sun.shadow.mapSize.set(sz, sz);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 }); this.sun.shadow.bias = -.0005; this.sun.shadow.normalBias = .03;
    this.scene.add(this.sun, this.sun.target, this.camera);

    this.mats = new Materials(lowQuality);
    const b = new Builder(this.mats);
    this.world = new World(b); this.scene.add(this.world.group);
    this.crane = new Crane(b, o.bus, (x, z) => this.world.supportAt(x, z), CRANE_START, MODELS); this.crane.balance = o.balance.crane; this.scene.add(this.crane.group);
    this.avatar = buildAvatar(b, o.character.appearance); this.avatar.setHelmet(true); this.scene.add(this.avatar.group);

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
    this.interactables.push({ id: 'crane', label: 'Weź kasetę suwnicy', radius: 1.3, pos: () => this.crane.pendantPos(), use: () => this.enterCrane() });
    this.interactables.push({ id: 'locker', label: 'Twoja szafka', radius: 1.2, pos: () => V(-6.3, 0, 23.9), use: () => bus.emit('toast', { text: 'Szafka: ubrania robocze i kaski odblokujesz za punkty (w kolejnym etapie).' }) });
    this.interactables.push({ id: 'board', label: 'Tablica ogłoszeń', radius: 1.4, pos: () => V(-5, 0, 13.8), use: () => bus.emit('toast', { text: 'Plan zmiany: 8 form KP-180 na stanowisku 1. Uwaga: kontrola BHP w tym tygodniu!' }) });
    this.interactables.push({ id: 'vending', label: 'Automat z napojami', radius: 1.3, pos: () => V(-8.8, 0, 14.4), use: () => bus.emit('toast', { text: 'Automat z napojami – przerwy w jadalni dodamy w kolejnym etapie.' }) });
    for (const m of this.world.mixers) this.interactables.push({ id: 'mixer', label: 'Mieszarka – sypanie', radius: 1.4, pos: () => V(m.x + .7, 0, m.z + .9), use: () => {
      const l = this.crane.loadAtStation(m.stationId);
      if (!l) { bus.emit('toast', { text: 'Pod mieszarką nie ma modelu. Podstaw model suwnicą na rolotok tego stanowiska i odczep hak.', kind: 'info' }); return; }
      bus.emit('pour:open', { stationId: m.stationId, modelId: l.id });
    } });
    this.interactables.push({ id: 'metals', label: 'Pojemnik z metalami', radius: 1.4, pos: () => V(14.5, 0, 13), use: () => bus.emit('toast', { text: 'Przekładanie metali na paletę dodamy w kolejnym etapie.' }) });
  }

  craneUnlocked(): boolean { return this.o.balance.devUnlockAll || this.o.character.points >= this.o.balance.crane.unlockPoints; }

  private enterCrane() {
    if (!this.craneUnlocked()) { this.o.bus.emit('crane:locked', { needPoints: this.o.balance.crane.unlockPoints, havePoints: this.o.character.points }); return; }
    this.mode = 'crane'; this.o.bus.emit('crane:enter', { gear: this.crane.state.gear });
  }
  exitCrane() { if (this.mode !== 'crane') return; this.mode = 'walk'; this.crane.state.vx = this.crane.state.vz = 0; this.o.bus.emit('crane:exit', undefined as never); }

  private onAction(a: string) {
    if (!this.running || this.paused) return;
    if (this.mode === 'crane') {
      if (a === 'attach' || a === 'use') this.crane.toggleAttach();
      if (a === 'gear') this.crane.setGear(this.crane.state.gear === 1 ? 2 : 1);
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
    if (this.outline) this.outline.render(this.scene, this.camera); else this.renderer.render(this.scene, this.camera);
    (window as unknown as { __frames: number }).__frames = ((window as unknown as { __frames: number }).__frames || 0) + 1;
  };

  private update(dt: number) {
    const mv = this.input.move();
    if (this.mode === 'walk') {
      const speed = (this.input.running() ? this.o.balance.player.runSpeed : this.o.balance.player.walkSpeed) * Math.min(1, Math.hypot(mv.x, mv.z));
      const p = this.world.col.move(this.player.x, this.player.z, .3, mv.x * speed * dt, mv.z * speed * dt);
      const moved = Math.hypot(p.x - this.player.x, p.z - this.player.z) / Math.max(dt, 1e-3);
      this.player.x = p.x; this.player.z = p.z; this.player.speed = moved;
      if (Math.hypot(mv.x, mv.z) > .1) this.player.heading = Math.atan2(mv.x, mv.z);
      this.crane.update(dt, { mx: 0, mz: 0, hoist: 0 });
      // najbliższy obiekt do użycia
      let best: Interactable | null = null, bd = 1e9;
      for (const it of this.interactables) { const q = it.pos(); const d = Math.hypot(q.x - this.player.x, q.z - this.player.z); if (d < it.radius && d < bd) { bd = d; best = it; } }
      if (best !== this.nearby) { this.nearby = best; this.o.bus.emit('interact:available', best ? { id: best.id, label: best.label } : null); }
    } else {
      this.crane.update(dt, { mx: mv.x, mz: mv.z, hoist: this.input.hoist() });
      // operator idzie obok kasety
      const pp = this.crane.pendantPos(); const target = this.world.col.resolve(pp.x, pp.z, .3);
      const dx = target.x - this.player.x, dz = target.z - this.player.z; const d = Math.hypot(dx, dz);
      const step = Math.min(d, 3 * dt); if (d > .01) { this.player.x += dx / d * step; this.player.z += dz / d * step; this.player.heading = Math.atan2(this.crane.state.x - this.player.x, this.crane.state.z - this.player.z); }
      this.player.speed = d > .05 ? 1.5 : 0;
      if (this.nearby) { this.nearby = null; this.o.bus.emit('interact:available', null); }
    }
    // postać
    const g = this.avatar.group; g.position.set(this.player.x, 0, this.player.z);
    let dh = this.player.heading - g.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); g.rotation.y += dh * Math.min(1, dt * 12);
    this.avatar.animate(dt, this.player.speed);
    const room = ROOMS.find(r => this.player.x >= r.x0 && this.player.x <= r.x1 && this.player.z >= r.z0 && this.player.z <= r.z1)?.name ?? '';
    if (room !== this.room) this.room = room;
    this.updateCamera(dt);
    this.saveT += dt; if (this.saveT > 15) { this.saveT = 0; this.savePosition(); }
  }

  private updateCamera(dt: number, snap = false) {
    const focus = this.mode === 'crane' ? (() => { const h = this.crane.hookWorld(); return V((h.x + this.player.x) / 2, 0, (h.z + this.player.z) / 2); })() : V(this.player.x, 0, this.player.z);
    this.camTarget.lerp(focus, snap ? 1 : 1 - Math.exp(-dt * 5));
    // widok z góry, lekko pochylony (kamera nad i trochę „za” – od strony +z)
    this.camPos.set(this.camTarget.x, 34, this.camTarget.z + 21);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x - 12, 22, this.camTarget.z - 6); this.sun.target.position.copy(this.camTarget);
  }

  private onResize = () => {
    const el = this.o.container; const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; const a = w / h;
    // na wąskim ekranie (telefon pionowo) pokaż więcej w poziomie
    const vh = this.zoom * (a < 1 ? 1.35 : 1);
    this.camera.top = vh / 2; this.camera.bottom = -vh / 2; this.camera.left = -vh / 2 * a; this.camera.right = vh / 2 * a; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
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
    this.running = false; this.offBus(); this.savePosition(); cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize); document.removeEventListener('visibilitychange', this.onHide);
    this.renderer.domElement.removeEventListener('wheel', this.wheel);
    this.input.dispose(); this.avatar.dispose();
    this.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.mats.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
