import * as THREE from 'three';
import { buildTextures, type TexKey } from './textures';

/**
 * Biblioteka materiałów w stylu „Rysunkowy realizm”:
 * tekstury z brudem (realizm) + cieniowanie w 4 tonach (rysunek). Kontury dodaje OutlineEffect.
 */
interface MatDef { c: number; t?: TexKey; tint?: number; emit?: number; transparent?: number; e?: number }
const DEFS: Record<string, MatDef> = {
  floor: { c: 0x77746e, t: 'floor', tint: 0xffffff }, tiles: { c: 0xd8d6d0, t: 'tiles', tint: 0xffffff }, wall: { c: 0x6f7377, t: 'wall', tint: 0xd8dde2 },
  wallTop: { c: 0x2a2c2e }, steel: { c: 0x5d6266, t: 'steel', tint: 0xffffff }, dark: { c: 0x2e3134, t: 'steel', tint: 0x8a8f94 },
  yellow: { c: 0xd3a51c, t: 'yellow', tint: 0xffffff }, blue: { c: 0x2f5f8c, t: 'blue', tint: 0xffffff }, orange: { c: 0xd8721e, t: 'yellow', tint: 0xffa070 },
  sand: { c: 0x262524, t: 'sand', tint: 0x9a9690 }, red: { c: 0xb4472c, t: 'red', tint: 0xffffff }, core: { c: 0xe0b424, t: 'yellow', tint: 0xffffff },
  green: { c: 0x46604e, t: 'green', tint: 0xffffff }, chill: { c: 0x3b3835, t: 'steel', tint: 0xa88a72 }, rubber: { c: 0x141414 },
  glove: { c: 0x5f6466, t: 'fabric', tint: 0x6c7174 }, jacket: { c: 0x283f5c, t: 'fabric', tint: 0x3a5578 }, pants: { c: 0x1f2a38, t: 'fabric', tint: 0x2c3a4c },
  hivis: { c: 0xc9d21c }, reflect: { c: 0xb8bcbe }, pallet: { c: 0x8e6a42, t: 'wood', tint: 0xffffff }, locker: { c: 0x7f8a8f, t: 'steel', tint: 0xb6c2c8 },
  lockerBlue: { c: 0x3e6f9e, t: 'steel', tint: 0x7fa7d0 }, bench: { c: 0x8e6a42, t: 'wood', tint: 0xffffff }, rack: { c: 0x2f5fa0 }, rackBeam: { c: 0xe0661c },
  eyeW: { c: 0xece8e2 }, pupil: { c: 0x0a0a0a }, lip: { c: 0x9c5d50 }, frame: { c: 0x151515 }, lens: { c: 0xb8d4e8, transparent: .3 },
  redBtn: { c: 0xd2261c, e: 0x200000 }, lamp: { c: 0xfff1d6, emit: 1.6 }, window: { c: 0xdfeaff, emit: 1.4 }, sign: { c: 0x2f9a52 },
  target: { c: 0xf2b705, emit: 1.2, transparent: .85 }, ghost: { c: 0xf2b705, emit: 1, transparent: .4 }, shadow: { c: 0x000000, transparent: .25 },
};

export class Materials {
  readonly tex: ReturnType<typeof buildTextures>;
  private cache = new Map<string, THREE.Material>();
  private grad: THREE.DataTexture;
  /** mapa tonów cieniowania rysunkowego (wspólna dla wszystkich materiałów) */
  get gradient(): THREE.DataTexture { return this.grad; }

  constructor(low: boolean) {
    this.tex = buildTextures(low);
    const g = new Uint8Array([60, 60, 60, 255, 125, 125, 125, 255, 192, 192, 192, 255, 255, 255, 255, 255]);
    this.grad = new THREE.DataTexture(g, 4, 1, THREE.RGBAFormat); this.grad.minFilter = this.grad.magFilter = THREE.NearestFilter; this.grad.needsUpdate = true;
  }

  get(key: string): THREE.Material {
    const hit = this.cache.get(key); if (hit) return hit;
    const d = DEFS[key] ?? { c: 0xff00ff }; let m: THREE.Material;
    if (d.emit) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.c).multiplyScalar(d.emit), transparent: d.transparent !== undefined, opacity: d.transparent ?? 1, depthWrite: d.transparent === undefined });
      m.userData.outlineParameters = { visible: false };
    } else {
      const o: THREE.MeshToonMaterialParameters = { color: new THREE.Color(d.c).offsetHSL(0, .07, .03), gradientMap: this.grad };
      if (d.t) { o.map = this.tex[d.t]; o.color = new THREE.Color(d.tint ?? 0xffffff).offsetHSL(0, .07, .03); }
      if (d.e) o.emissive = new THREE.Color(d.e);
      if (d.transparent !== undefined) { o.transparent = true; o.opacity = d.transparent; o.depthWrite = false; }
      m = new THREE.MeshToonMaterial(o);
      if (d.transparent !== undefined) m.userData.outlineParameters = { visible: false };
    }
    this.cache.set(key, m); return m;
  }

  /** Materiał w dowolnym kolorze (np. skóra, włosy postaci). */
  color(hex: string, key = 'c:' + hex): THREE.Material {
    const hit = this.cache.get(key); if (hit) return hit;
    const m = new THREE.MeshToonMaterial({ color: new THREE.Color(hex), gradientMap: this.grad });
    this.cache.set(key, m); return m;
  }

  dispose() { this.cache.forEach(m => m.dispose()); Object.values(this.tex).forEach(t => t.dispose()); this.grad.dispose(); }
}
