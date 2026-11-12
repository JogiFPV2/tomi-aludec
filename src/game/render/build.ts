import * as THREE from 'three';
import type { Materials } from './materials';

/** Pomocnicze funkcje do składania brył z prostych kształtów. */
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Builder {
  constructor(public mats: Materials) {}

  mesh(geo: THREE.BufferGeometry, mat: string | THREE.Material, p?: [number, number, number], r?: [number, number, number], cast = true): THREE.Mesh {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? this.mats.get(mat) : mat);
    m.castShadow = cast; m.receiveShadow = true;
    if (p) m.position.set(...p); if (r) m.rotation.set(...r); return m;
  }
  box(w: number, h: number, d: number, mat: string | THREE.Material, p: [number, number, number], r?: [number, number, number]) { return this.mesh(new THREE.BoxGeometry(w, h, d), mat, p, r); }
  cyl(rt: number, rb: number, h: number, mat: string | THREE.Material, p: [number, number, number], r?: [number, number, number], seg = 16) { return this.mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, p, r); }
  sphere(rad: number, mat: string | THREE.Material, p: [number, number, number], s?: [number, number, number], seg = 16) { const m = this.mesh(new THREE.SphereGeometry(rad, seg, Math.max(8, seg * .7 | 0)), mat, p); if (s) m.scale.set(...s); return m; }
  limb(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: string | THREE.Material, seg = 10, r2?: number) {
    const dir = b.clone().sub(a); const len = dir.length();
    const m = this.mesh(new THREE.CylinderGeometry(r2 ?? r, r, len, seg), mat);
    m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize()); return m;
  }
  /** Segment o zmiennej długości (lina, łańcuch) – aktualizowany co klatkę funkcją setSeg. */
  seg(mat: string, r: number) { const m = this.mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), mat); m.scale.set(r, 1, r); m.userData.r = r; return m; }
}

const _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function setSeg(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  _d.subVectors(b, a); const len = _d.length(); if (len < 1e-5) { m.visible = false; return; }
  m.visible = true; m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
  const r = m.userData.r as number; m.scale.set(r, len, r);
}
