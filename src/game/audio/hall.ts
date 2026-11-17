import { STATIONS, LADLE, HALL, PAINT } from '../../data/layout';

/**
 * Dźwięk hali produkcyjnej – wszystko generowane w przeglądarce (Web Audio), poza nagranym wołaniem „eeee”.
 *  - tło: niskie dudnienie hali, szum wentylacji, buczenie instalacji,
 *  - zdarzenia w losowych miejscach: uderzenia metalu, stuknięcia, syk sprężonego powietrza, brzęk łańcucha, pikanie wózka,
 *  - od czasu do czasu ktoś woła „eeee” z drugiego końca hali,
 *  - przy źródłach: bulgot i syk kadzi z aluminium, warkot jadącej suwnicy, ogień w malarni.
 * Głośność i kierunek (lewo/prawo) liczone względem gracza; daleki dźwięk jest cichszy, przytłumiony i bardziej „hallowy”.
 */
export interface Listener { x: number; z: number }
export interface HallAudioOptions { callUrl: string; volume: number; ambience: number; listener: () => Listener; craneSpeed: () => { x: number; z: number; speed: number } | null; fires: () => Listener[] }

type Ctx = BaseAudioContext;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Szum w buforze (biały / różowy / brązowy), zapętlany. */
function noiseBuffer(ctx: Ctx, sec: number, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') { b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * .1848) * .2; }
    else { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
  }
  // płynne zapętlenie
  const f = Math.floor(ctx.sampleRate * .05); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  return buf;
}
/** Pogłos dużej hali: sztuczna odpowiedź impulsowa (gasnący szum, wczesne odbicia). */
function hallImpulse(ctx: Ctx, sec = 2.6): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.4) * (t < .012 ? t / .012 : 1); }
    for (const t of [.019, .031, .047, .071]) { const i = Math.floor(t * ctx.sampleRate) + ch * 37; d[i] += .6; }
  }
  return buf;
}

export class HallAudio {
  readonly ctx: Ctx;
  private master: GainNode; private amb: GainNode; private fx: GainNode; private verb: ConvolverNode; private verbIn: GainNode;
  private noise: Record<'white' | 'pink' | 'brown', AudioBuffer>;
  private call: AudioBuffer | null = null;
  private timers: number[] = []; private loops: { stop: () => void }[] = []; private alive = true;
  private ladle!: { pan: StereoPannerNode; gain: GainNode };
  private crane!: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode; filt: BiquadFilterNode };
  private fire!: { gain: GainNode; pan: StereoPannerNode };
  private tick = 0;

  constructor(private o: HallAudioOptions, ctx?: Ctx) {
    this.ctx = ctx ?? new AudioContext({ latencyHint: 'playback' });
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = o.volume; this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = o.ambience; this.amb.connect(comp);
    this.fx = c.createGain(); this.fx.connect(comp);
    this.verb = c.createConvolver(); this.verb.buffer = hallImpulse(c); this.verbIn = c.createGain(); this.verbIn.gain.value = .9;
    const verbOut = c.createGain(); verbOut.gain.value = .55; this.verbIn.connect(this.verb).connect(verbOut).connect(comp);
    this.noise = { white: noiseBuffer(c, 3, 'white'), pink: noiseBuffer(c, 4, 'pink'), brown: noiseBuffer(c, 5, 'brown') };
    this.buildAmbience(); this.buildSources();
    fetch(o.callUrl).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b)).then(b => { this.call = b; }).catch(e => console.warn('[dźwięk] brak nagrania wołania', e));
  }

  setVolume(v: number, amb: number) { const t = this.ctx.currentTime; this.master.gain.setTargetAtTime(v, t, .1); this.amb.gain.setTargetAtTime(amb, t, .1); }

  // ---------- tło ----------
  private loop(buf: AudioBuffer, out: AudioNode, rate = 1) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.connect(out); s.start(this.ctx.currentTime + .01); this.loops.push({ stop: () => { try { s.stop(); } catch { /* już zatrzymany */ } } }); return s; }
  private buildAmbience() {
    const c = this.ctx;
    // dudnienie hali
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; const g1 = c.createGain(); g1.gain.value = .3; this.loop(this.noise.brown, lp); lp.connect(g1).connect(this.amb);
    // wentylacja (szeroki szum, lekko falujący)
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = .5; const g2 = c.createGain(); g2.gain.value = .07; this.loop(this.noise.pink, bp); bp.connect(g2).connect(this.amb);
    const lfo = c.createOscillator(); lfo.frequency.value = .07; const lfoG = c.createGain(); lfoG.gain.value = .025; lfo.connect(lfoG).connect(g2.gain); lfo.start();
    this.loops.push({ stop: () => lfo.stop() });
    // buczenie instalacji 50 Hz z harmonicznymi
    for (const [f, a] of [[50, .05], [100, .035], [150, .012], [300, .004]] as [number, number][]) {
      const o = c.createOscillator(); o.frequency.value = f + rnd(-.2, .2); const g = c.createGain(); g.gain.value = a; o.connect(g).connect(this.amb); o.start(); this.loops.push({ stop: () => o.stop() });
    }
    // dalekie maszyny: wolne, rytmiczne „ciach-ciach” bardzo cicho w pogłosie
    const rhythm = () => { if (!this.alive) return; this.thump(rnd(.04, .09), rnd(55, 75), true); this.later(rnd(.9, 1.3), rhythm); };
    this.later(2, rhythm);
  }
  private buildSources() {
    const c = this.ctx;
    // kadź: bulgot (szum przez filtr skaczący po częstotliwościach) + syk
    { const pan = c.createStereoPanner(), gain = c.createGain(); gain.gain.value = 0; pan.connect(gain).connect(this.fx); gain.connect(this.verbIn);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = 300; this.loop(this.noise.white, bp); const bg = c.createGain(); bg.gain.value = .5; bp.connect(bg).connect(pan);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; this.loop(this.noise.white, hp, .8); const hg = c.createGain(); hg.gain.value = .06; hp.connect(hg).connect(pan);
      const bubble = () => { if (!this.alive) return; bp.frequency.setTargetAtTime(rnd(150, 650), c.currentTime, .02); bg.gain.setTargetAtTime(rnd(.15, .7), c.currentTime, .03); this.later(rnd(.05, .18), bubble); }; bubble();
      this.ladle = { pan, gain }; }
    // suwnica: warkot silnika (piła przez filtr), głośniejszy i wyższy przy jeździe
    { const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 45; const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 400; const gain = c.createGain(); gain.gain.value = 0; const pan = c.createStereoPanner();
      osc.connect(filt).connect(gain).connect(pan).connect(this.fx); gain.connect(this.verbIn); osc.start(); this.loops.push({ stop: () => osc.stop() }); this.crane = { osc, gain, pan, filt }; }
    // ogień w malarni: trzask i szum
    { const pan = c.createStereoPanner(), gain = c.createGain(); gain.gain.value = 0; const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900; this.loop(this.noise.pink, bp, .7); bp.connect(gain).connect(pan).connect(this.fx); this.fire = { gain, pan }; }
  }

  // ---------- zdarzenia ----------
  /** Uruchamia losowe odgłosy hali i wołania. */
  start() {
    const ev = () => { if (!this.alive) return; this.randomEvent(); this.later(rnd(1.2, 5.5), ev); };
    this.later(1.5, ev);
    const call = () => { if (!this.alive) return; this.shout(); this.later(rnd(35, 95), call); };
    this.later(rnd(12, 25), call);
  }
  private later(sec: number, fn: () => void) { if (this.ctx instanceof OfflineAudioContext) { void this.ctx.suspend(this.ctx.currentTime + sec).then(fn).then(() => (this.ctx as OfflineAudioContext).resume()).catch(() => {}); return; } this.timers.push(window.setTimeout(fn, sec * 1000)); }
  private randomPos(): Listener { return Math.random() < .55 ? { x: pick(STATIONS).x + rnd(-6, 6), z: rnd(2, 12) } : { x: rnd(2, HALL.w - 2), z: rnd(2, HALL.d - 2) }; }
  /** Wejście dla dźwięku w punkcie świata: głośność, kierunek, przytłumienie i pogłos zależne od odległości. */
  private spot(p: Listener, gain = 1): AudioNode {
    const c = this.ctx, L = this.o.listener(); const dx = p.x - L.x, dz = p.z - L.z, d = Math.hypot(dx, dz);
    const g = c.createGain(); g.gain.value = gain / (1 + d / 16);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(1600, 16000 / (1 + d / 14));
    const pan = c.createStereoPanner(); pan.pan.value = Math.max(-.9, Math.min(.9, dx / 14));
    const wet = c.createGain(); wet.gain.value = gain * Math.min(.7, .2 + d / 60);
    g.connect(lp).connect(pan).connect(this.fx); lp.connect(wet).connect(this.verbIn);
    return g;
  }
  private randomEvent() {
    const p = this.randomPos(); const r = Math.random();
    if (r < .34) this.clank(p);
    else if (r < .52) this.thumpAt(p);
    else if (r < .68) this.hiss(p);
    else if (r < .82) this.chain(p);
    else if (r < .93) this.beeper({ x: rnd(4, HALL.w - 4), z: rnd(26, HALL.d - 3) });
    else { this.clank(p); this.later(rnd(.15, .4), () => this.clank(p, .6)); }
  }
  /** Uderzenie metalu o metal: kilka nieharmonicznych tonów gasnących z różną szybkością. */
  clank(p: Listener, k = 1) {
    const c = this.ctx, t = c.currentTime + .01, out = this.spot(p, 1.6 * k); const base = rnd(260, 620);
    for (const [m, a, dec] of [[1, .5, .35], [2.76, .3, .22], [5.4, .18, .12], [8.9, .08, .07]] as [number, number, number][]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = base * m * rnd(.98, 1.02); const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + .002); g.gain.exponentialRampToValueAtTime(.0005, t + dec * rnd(.8, 1.6));
      o.connect(g).connect(out); o.start(t); o.stop(t + 2);
    }
    this.burst(out, t, .02, 'white', 2500, .5);
  }
  private thumpAt(p: Listener) { const out = this.spot(p, 1.8); this.thump(.6, rnd(60, 95), false, out); this.burst(out, this.ctx.currentTime, .05, 'brown', 600, .6); }
  /** Głuche uderzenie (np. forma odstawiana na paletę). */
  private thump(a: number, f: number, far: boolean, out?: AudioNode) {
    const c = this.ctx, t = c.currentTime + .01; const o = c.createOscillator(); o.frequency.setValueAtTime(f * 1.8, t); o.frequency.exponentialRampToValueAtTime(f, t + .08);
    const g = c.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(.0005, t + .35);
    o.connect(g).connect(out ?? (far ? this.verbIn : this.fx)); o.start(t); o.stop(t + .5);
  }
  private burst(out: AudioNode, t: number, dur: number, kind: 'white' | 'pink' | 'brown', f: number, a: number, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise[kind]; s.playbackRate.value = rnd(.9, 1.1);
    const bf = c.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = type === 'bandpass' ? .8 : .7;
    const g = c.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    s.connect(bf).connect(g).connect(out); s.start(t, rnd(0, 2)); s.stop(t + dur + .05);
  }
  /** Syk sprężonego powietrza (pneumatyka). */
  private hiss(p: Listener) {
    const c = this.ctx, t = c.currentTime + .01, out = this.spot(p, .9), dur = rnd(.3, 1.1);
    const s = c.createBufferSource(); s.buffer = this.noise.white; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = rnd(2500, 4500);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35, t + .03); g.gain.setValueAtTime(.35, t + dur * .7); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    s.connect(hp).connect(g).connect(out); s.start(t, rnd(0, 2)); s.stop(t + dur + .05);
  }
  /** Brzęk łańcucha: seria krótkich metalicznych stuknięć. */
  private chain(p: Listener) {
    const c = this.ctx, out = this.spot(p, 1.2); let t = c.currentTime + .01; const n = Math.floor(rnd(5, 12));
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(); o.frequency.value = rnd(1800, 3600); const g = c.createGain(); g.gain.setValueAtTime(rnd(.08, .2), t); g.gain.exponentialRampToValueAtTime(.0005, t + .06);
      o.connect(g).connect(out); o.start(t); o.stop(t + .08); this.burst(out, t, .015, 'white', 5000, .15); t += rnd(.03, .11);
    }
  }
  /** Pikanie wózka cofającego. */
  private beeper(p: Listener) {
    const c = this.ctx, out = this.spot(p, .6); const t0 = c.currentTime + .01, n = Math.floor(rnd(3, 7));
    for (let i = 0; i < n; i++) { const t = t0 + i * .9; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1050; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .01); g.gain.setValueAtTime(.12, t + .42); g.gain.linearRampToValueAtTime(0, t + .45); o.connect(g).connect(out); o.start(t); o.stop(t + .5); }
  }
  /** Wołanie „eeee” z nagrania – z daleka, czasem dwa razy, za każdym razem trochę inną wysokością. */
  shout(p?: Listener) {
    if (!this.call) return; const c = this.ctx;
    const L = this.o.listener(); const pos = p ?? (() => { for (let i = 0; i < 8; i++) { const q = this.randomPos(); if (Math.hypot(q.x - L.x, q.z - L.z) > 12) return q; } return this.randomPos(); })();
    const out = this.spot(pos, 2.4); const rate = rnd(.9, 1.08); const twice = Math.random() < .4;
    const play = (t: number, r: number) => { const s = c.createBufferSource(); s.buffer = this.call; s.playbackRate.value = r; s.connect(out); s.start(t); };
    const t = c.currentTime + .02; play(t, rate); if (twice) play(t + this.call.duration / rate + rnd(.35, .7), rate * rnd(.97, 1.04));
  }

  /** Co klatkę (lub rzadziej): położenie gracza względem kadzi, suwnicy i ognia. */
  update() {
    const c = this.ctx, t = c.currentTime, L = this.o.listener();
    const place = (p: Listener, pan: StereoPannerNode, g: GainNode, base: number, range: number) => { const dx = p.x - L.x, d = Math.hypot(dx, p.z - L.z); pan.pan.setTargetAtTime(Math.max(-.9, Math.min(.9, dx / 12)), t, .1); g.gain.setTargetAtTime(base / (1 + (d / range) ** 2), t, .15); };
    place(LADLE, this.ladle.pan, this.ladle.gain, .5, 6);
    const cr = this.o.craneSpeed();
    if (cr) { const k = Math.min(1, cr.speed / 1.1); place(cr, this.crane.pan, this.crane.gain, .02 + k * .2, 14); this.crane.osc.frequency.setTargetAtTime(42 + k * 38, t, .2); this.crane.filt.frequency.setTargetAtTime(300 + k * 900, t, .2); }
    else this.crane.gain.gain.setTargetAtTime(0, t, .3);
    const fires = this.o.fires();
    if (fires.length) { const f = fires.reduce((a, b) => Math.hypot(a.x - L.x, a.z - L.z) < Math.hypot(b.x - L.x, b.z - L.z) ? a : b); place(f, this.fire.pan, this.fire.gain, .28, 5); }
    else this.fire.gain.gain.setTargetAtTime(0, t, .2);
    void PAINT; this.tick++;
  }

  suspend() { if (this.ctx instanceof AudioContext && this.ctx.state === 'running') void this.ctx.suspend(); }
  resume() { if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') void this.ctx.resume(); }
  dispose() {
    this.alive = false; this.timers.forEach(clearTimeout); this.loops.forEach(l => l.stop());
    if (this.ctx instanceof AudioContext) void this.ctx.close();
  }
}
