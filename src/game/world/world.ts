import * as THREE from 'three';
import { Builder, V } from '../render/build';
import { CollisionWorld } from './collision';
import { ROOMS, WALLS, STATIONS, COLUMNS, PALLETS, DOORS } from '../../data/layout';

/** Buduje świat z danych układu: podłogi, ściany, stanowiska, wyposażenie, kolizje i podłoża. */
export interface Support { x0: number; z0: number; x1: number; z1: number; h: number }

export class World {
  group = new THREE.Group();
  col = new CollisionWorld();
  supports: Support[] = [];
  labels: { text: string; pos: THREE.Vector3 }[] = [];
  mixers: { arm: THREE.Object3D; x: number; z: number; stationId: string }[] = [];

  constructor(private b: Builder) {
    this.buildRooms(); this.buildHall(); this.buildLockerRoom(); this.buildCorridor();
  }

  /** Wysokość podłoża (rolotok, paleta, podłoga) w punkcie – używa suwnica przy odstawianiu ładunku. */
  supportAt(x: number, z: number): number {
    let h = 0; for (const s of this.supports) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) h = Math.max(h, s.h); return h;
  }

  private buildRooms() {
    const b = this.b;
    for (const r of ROOMS) {
      const w = r.x1 - r.x0, d = r.z1 - r.z0;
      const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv as THREE.BufferAttribute; const rep = r.floor === 'tiles' ? 1 / 3 : 1 / 4;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * rep, uv.getY(i) * d * rep);
      const m = b.mesh(geo, r.floor, [(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2], undefined, false); m.receiveShadow = true; this.group.add(m);
    }
    // ściany: dalsze wysokie, bliższe kamerze niskie (przekrój)
    for (const wl of WALLS) {
      const t = .22, len = Math.hypot(wl.x1 - wl.x0, wl.z1 - wl.z0), h = wl.low ? .55 : 3.2;
      const alongX = wl.z0 === wl.z1;
      const m = b.box(alongX ? len + t : t, h, alongX ? t : len + t, 'wall', [(wl.x0 + wl.x1) / 2, h / 2, (wl.z0 + wl.z1) / 2]);
      this.group.add(m); this.group.add(b.box(alongX ? len + t : t, .04, alongX ? t : len + t, 'wallTop', [(wl.x0 + wl.x1) / 2, h + .02, (wl.z0 + wl.z1) / 2]));
      this.col.addRect({ x0: Math.min(wl.x0, wl.x1) - t / 2, z0: Math.min(wl.z0, wl.z1) - t / 2, x1: Math.max(wl.x0, wl.x1) + t / 2, z1: Math.max(wl.z0, wl.z1) + t / 2 });
    }
    // okna w północnej ścianie hali
    for (let x = 3; x < 36; x += 5) this.group.add(b.box(3, 1.2, .05, 'window', [x, 2.2, .13]));
    for (const d of DOORS) if (d.label) this.labels.push({ text: d.label, pos: V(d.x, 2.6, d.z) });
    // znak wyjścia
    this.group.add(b.box(.5, .2, .05, 'sign', [-.2, 2.6, 15]));
  }

  private buildHall() {
    const b = this.b, g = this.group;
    // linie bezpieczeństwa
    for (const z of [3.2, 10.6]) g.add(b.box(34, .006, .1, 'core', [18, .003, z]));
    // słupy
    for (const [x, z] of COLUMNS) { g.add(b.box(.45, 3.2, .45, 'yellow', [x, 1.6, z])); this.col.addRect({ x0: x - .25, z0: z - .25, x1: x + .25, z1: z + .25 }); }
    // tory suwnicy wzdłuż ścian
    g.add(b.box(36, .3, .25, 'yellow', [18, 3.0, .3]), b.box(36, .3, .25, 'yellow', [18, 3.0, 21.7]));
    // stanowiska: rolotok + mieszarka
    for (const st of STATIONS) {
      const s = new THREE.Group(); s.position.set(st.x, 0, st.z); g.add(s);
      for (const z of [-.62, .62]) s.add(b.box(4.4, .14, .08, 'yellow', [0, .42, z]));
      for (let x = -2.1; x <= 2.1; x += .3) s.add(b.cyl(.045, .045, 1.18, 'steel', [x, .44, 0], [Math.PI / 2, 0, 0], 8));
      for (const x of [-2, 0, 2]) for (const z of [-.62, .62]) s.add(b.box(.08, .42, .08, 'dark', [x, .21, z]));
      this.supports.push({ x0: st.x - 2.2, z0: st.z - .66, x1: st.x + 2.2, z1: st.z + .66, h: .5 });
      this.col.addRect({ x0: st.x - 2.25, z0: st.z - .7, x1: st.x + 2.25, z1: st.z + .7 });
      // pole docelowe
      const tg = new THREE.Group(); tg.position.set(0, .52, 0); s.add(tg);
      for (const [w, d, x, z] of [[1.72, .035, 0, .66], [1.72, .035, 0, -.66], [.035, 1.32, .86, 0], [.035, 1.32, -.86, 0]]) tg.add(b.box(w, .01, d, 'target', [x, 0, z]));
      // mieszarka
      const mx = -2.9, mz = -2.2;
      s.add(b.cyl(.45, .55, .5, 'blue', [mx, .25, mz], undefined, 20), b.cyl(.32, .32, 2.6, 'blue', [mx, 1.75, mz], undefined, 20), b.cyl(.42, .42, .35, 'dark', [mx, 3.1, mz], undefined, 20));
      const arm = new THREE.Group(); arm.position.set(mx, 3.0, mz); s.add(arm);
      arm.add(b.limb(V(0, 0, 0), V(2.6, -.2, 1.9), .18, 'blue', 12));
      arm.add(b.cyl(.2, .08, .45, 'blue', [2.6, -.45, 1.9], undefined, 14));
      this.mixers.push({ arm, x: st.x + mx, z: st.z + mz, stationId: st.id });
      this.col.addCircle({ x: st.x + mx, z: st.z + mz, r: .6 });
      // pulpit
      s.add(b.box(.4, 1.1, .3, 'steel', [mx + .7, .55, mz + .2]), b.box(.08, .08, .02, 'redBtn', [mx + .7, .95, mz + .36]));
      this.labels.push({ text: st.name, pos: V(st.x, 1.7, st.z) });
    }
    // regały z modelami przy północnej ścianie
    for (let x = 3; x <= 33; x += 4.2) {
      const r = new THREE.Group(); r.position.set(x, 0, 1.4); g.add(r);
      for (const dx of [-1.7, 1.7]) for (const dz of [-.5, .5]) r.add(b.box(.09, 2.6, .09, 'rack', [dx, 1.3, dz]));
      for (const y of [.2, 1.3, 2.4]) for (const dz of [-.5, .5]) r.add(b.box(3.5, .1, .08, 'rackBeam', [0, y, dz]));
      for (const y of [.26, 1.36]) for (const dx of [-.9, .9]) { const h = .3 + ((x * 7 + y * 3 + dx) % 1) * .5; r.add(b.box(1, h, .85, (x + dx) % 2 ? 'green' : 'red', [dx, y + .06 + h / 2, 0])); }
      this.col.addRect({ x0: x - 1.8, z0: .8, x1: x + 1.8, z1: 2 });
    }
    // palety (część pusta – do szukania), gotowe formy
    for (const [x, z] of PALLETS) this.pallet(x, z);
    for (let i = 0; i < 4; i++) { const x = 21 + i * 1.8, z = 18.8; this.pallet(x, z); g.add(b.box(1.44, .5, 1.04, 'sand', [x, .39, z])); }
    // paleta z modelami do przeniesienia
    this.pallet(8.5, 11.6); this.pallet(11.2, 11.6);
    // pojemnik na metale
    g.add(b.box(1.6, .7, 1.1, 'steel', [14.5, .35, 12]));
    for (let i = 0; i < 8; i++) g.add(b.box(.13, .1, .08, 'chill', [14.0 + (i % 4) * .3, .74, 11.8 + Math.floor(i / 4) * .35]));
    this.col.addRect({ x0: 13.7, z0: 11.45, x1: 15.3, z1: 12.55 });
    this.labels.push({ text: 'Pojemnik z metalami', pos: V(14.5, 1.4, 12) });
    // wózek widłowy (stoi)
    const fk = new THREE.Group(); fk.position.set(31, 0, 17); fk.rotation.y = -Math.PI / 2; g.add(fk);
    fk.add(b.box(1.2, .7, 2, 'orange', [0, .6, 0]), b.box(1.1, .06, 1.5, 'dark', [0, 2.25, .1]));
    for (const x of [-.5, .5]) for (const z of [.8, -.6]) fk.add(b.box(.06, 1.3, .06, 'dark', [x, 1.6, z]));
    for (const [x, z] of [[-.58, .6], [.58, .6], [-.55, -.7], [.55, -.7]]) fk.add(b.cyl(.28, .28, .25, 'rubber', [x, .28, z], [0, 0, Math.PI / 2], 14));
    for (const x of [-.3, .3]) fk.add(b.box(.1, .05, 1.1, 'steel', [x, .05, 1.7]));
    this.col.addRect({ x0: 29.8, z0: 16.3, x1: 33.6, z1: 17.7 });
  }

  pallet(x: number, z: number) {
    const b = this.b; this.group.add(b.box(1.5, .14, 1.2, 'pallet', [x, .07, z]));
    this.supports.push({ x0: x - .75, z0: z - .6, x1: x + .75, z1: z + .6, h: .14 });
  }

  private buildLockerRoom() {
    const b = this.b, g = this.group;
    for (let i = 0; i < 9; i++) {
      const x = -9.5 + i * .8 + .4;
      g.add(b.box(.78, 1.95, .5, i === 4 ? 'lockerBlue' : 'locker', [x, .98, 24.5]));
      g.add(b.box(.04, .14, .03, 'steel', [x + .28, 1.05, 24.24]));
    }
    this.col.addRect({ x0: -10, z0: 24.2, x1: -2.6, z1: 25 });
    g.add(b.box(.5, 1.95, 4.2, 'locker', [-9.65, .98, 20.5]));
    this.col.addRect({ x0: -10, z0: 18.4, x1: -9.4, z1: 22.6 });
    for (const z of [20, 22.4]) { g.add(b.box(3, .06, .4, 'bench', [-6, .45, z]), b.box(.06, .42, .36, 'steel', [-7.3, .21, z]), b.box(.06, .42, .36, 'steel', [-4.7, .21, z])); this.col.addRect({ x0: -7.5, z0: z - .2, x1: -4.5, z1: z + .2 }); }
    this.labels.push({ text: 'Szatnia', pos: V(-6, 2.4, 23.8) });
  }

  private buildCorridor() {
    const b = this.b, g = this.group;
    // tablica ogłoszeń i automat (zapowiedź jadalni)
    g.add(b.box(1.6, .9, .05, 'pallet', [-5, 1.6, 13.15]), b.box(1.3, .6, .02, 'tiles', [-5, 1.6, 13.19]));
    g.add(b.box(.8, 1.8, .7, 'red', [-8.8, .9, 13.5]), b.box(.5, .7, .02, 'window', [-8.8, 1.2, 13.86]));
    this.col.addRect({ x0: -9.2, z0: 13.1, x1: -8.4, z1: 13.9 });
    this.labels.push({ text: 'Tablica ogłoszeń', pos: V(-5, 2.4, 13.2) }, { text: 'Automat z napojami', pos: V(-8.8, 2.3, 13.5) });
  }
}
