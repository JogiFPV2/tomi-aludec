/** Proste kolizje 2D (rzut z góry): postać = koło, przeszkody = prostokąty i koła. */
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Circle { x: number; z: number; r: number }

export class CollisionWorld {
  rects: Rect[] = [];
  circles: Circle[] = [];

  addRect(r: Rect) { this.rects.push({ x0: Math.min(r.x0, r.x1), z0: Math.min(r.z0, r.z1), x1: Math.max(r.x0, r.x1), z1: Math.max(r.z0, r.z1) }); }
  addCircle(c: Circle) { this.circles.push(c); }

  /** Przesuwa koło o (dx,dz) i wypycha je z przeszkód. Zwraca nowe położenie. */
  move(x: number, z: number, r: number, dx: number, dz: number): { x: number; z: number } {
    // ruch w krokach, żeby przy dużej prędkości nie przenikać przez cienkie ściany
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
    for (let i = 0; i < steps; i++) {
      x += dx / steps; z += dz / steps;
      for (let it = 0; it < 2; it++) ({ x, z } = this.resolve(x, z, r));
    }
    return { x, z };
  }

  resolve(x: number, z: number, r: number): { x: number; z: number } {
    for (const b of this.rects) {
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
      else {
        // środek koła wewnątrz prostokąta – wypchnij najkrótszą drogą
        const pushes = [[b.x0 - r - x, 0], [b.x1 + r - x, 0], [0, b.z0 - r - z], [0, b.z1 + r - z]];
        pushes.sort((a, c) => Math.hypot(a[0], a[1]) - Math.hypot(c[0], c[1]));
        x += pushes[0][0]; z += pushes[0][1];
      }
    }
    for (const c of this.circles) {
      const dx = x - c.x, dz = z - c.z; const d = Math.hypot(dx, dz); const min = r + c.r;
      if (d < min && d > 1e-6) { x = c.x + dx / d * min; z = c.z + dz / d * min; }
    }
    return { x, z };
  }
}
