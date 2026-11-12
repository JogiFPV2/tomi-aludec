import * as THREE from 'three';

/** Tekstury generowane w kodzie (bez plików graficznych) – brudne, przemysłowe materiały. */
function hash(x: number, y: number) { let h = x * 374761393 + y * 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x: number, y: number, p: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const w = (a: number) => ((a % p) + p) % p;
  const a = hash(w(xi), w(yi)), b = hash(w(xi + 1), w(yi)), c = hash(w(xi), w(yi + 1)), d = hash(w(xi + 1), w(yi + 1));
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, p: number, o = 5) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, p * f); a *= .5; f *= 2; } return s; }
const cl = (v: number) => Math.max(0, Math.min(255, v));
type Px = (u: number, v: number, x: number, y: number, n: number) => [number, number, number];

function make(size: number, fn: Px, rep: [number, number] = [1, 1]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!;
  const img = g.createImageData(size, size); const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const r = fn(x / size, y / size, x, y, size); const i = (y * size + x) * 4; d[i] = r[0]; d[i + 1] = r[1]; d[i + 2] = r[2]; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export type TexKey = 'floor' | 'tiles' | 'wall' | 'yellow' | 'steel' | 'sand' | 'fabric' | 'red' | 'green' | 'blue' | 'wood';
export function buildTextures(low: boolean): Record<TexKey, THREE.CanvasTexture> {
  const S = low ? 256 : 512, s2 = low ? 128 : 256;
  return {
    floor: make(S, (u, v, _x, _y, n) => {
      // malowany beton: szerokie, miękkie plamy koloru, delikatne ziarno, bez ostrych pęknięć
      const big = fbm(u * 3, v * 3, 3, 4), mid = fbm(u * 9 + 4, v * 9, 9, 3), grain = hash(Math.floor(u * n), Math.floor(v * n));
      let b = 132 + (big - .5) * 34 + (mid - .5) * 16 + grain * 6;
      const stain = Math.max(0, fbm(u * 2.5 + 7, v * 2.5, 2.5, 4) - .58) * 2.2; b *= 1 - stain * .35;
      const warm = (big - .5) * 10;
      return [cl(b + 10 + warm), cl(b + 1), cl(b - 12 - warm)];
    }, [1, 1]),
    tiles: make(s2, (u, v) => { const gx = (u * 8) % 1, gy = (v * 8) % 1; const grout = gx < .04 || gy < .04; const n = fbm(u * 6, v * 6, 6) * 20; const b = grout ? 120 : 196 + n; return [cl(b), cl(b), cl(b - 6)]; }),
    wall: make(S, (u, v) => { const rib = Math.sin(u * Math.PI * 2 * 24) > 0 ? 12 : -10; const b = 112 + rib + fbm(u * 6, v * 6, 6) * 30 - 15 - fbm(u * 40, v * 2, 40, 3) * 30 * v; return [cl(b - 2), cl(b + 2), cl(b + 6)]; }),
    yellow: make(s2, (u, v, x, y) => {
      const no = fbm(u * 8, v * 8, 8), rust = Math.max(0, fbm(u * 5 + 3, v * 5, 5, 4) - .6) * 4; let c = [214, 178, 44].map(k => k * (.82 + no * .3));
      if (rust > 0) { const t = Math.min(1, rust); c = c.map((k, i) => k * (1 - t) + [96, 58, 34][i] * t); } if (hash(x, y) > .996) c = [60, 58, 55]; return c.map(cl) as [number, number, number];
    }),
    steel: make(s2, (u, v, x, y) => { const b = 80 + fbm(u * 8, v * 8, 8) * 34 + (hash(x, Math.floor(y / 3)) > .995 ? 30 : 0); return [cl(b - 3), cl(b), cl(b + 3)]; }),
    sand: make(s2, (u, v, x, y) => { const g = hash(x, y); let b = 40 + fbm(u * 10, v * 10, 10, 3) * 26 + g * 30; if (g > .985) b += 50; return [cl(b + 1), cl(b), cl(b - 1)]; }, [2, 2]),
    fabric: make(128, (_u, _v, x, y) => { const b = 225 + (((x + y) % 4 < 2) ? 6 : -6) + hash(x, y) * 10; return [cl(b), cl(b), cl(b)]; }, [3, 3]),
    red: make(s2, (u, v) => { const no = fbm(u * 6, v * 24, 6, 4); const chip = fbm(u * 9 + 2, v * 9, 9, 4) > .68; return (chip ? [150, 112, 72] : [172, 62, 40]).map(k => cl(k * (.85 + no * .3))) as [number, number, number]; }),
    green: make(s2, (u, v) => { const no = fbm(u * 5, v * 20, 5, 4); const chip = fbm(u * 9 + 7, v * 9, 9, 4) > .7; return (chip ? [140, 108, 70] : [70, 98, 78]).map(k => cl(k * (.85 + no * .3))) as [number, number, number]; }),
    blue: make(s2, (u, v) => { const no = fbm(u * 8, v * 8, 8); return (fbm(u * 4, v * 4 + 9, 4, 4) > .62 ? [70, 62, 52] : [48, 92, 136].map(k => k * (.8 + no * .35))).map(cl) as [number, number, number]; }),
    wood: make(s2, (u, v) => { const g = Math.sin((u * 40 + fbm(u * 3, v * 3, 3) * 6)) * 12; const b = 150 + g + fbm(u * 8, v * 30, 8) * 30; return [cl(b), cl(b * .78), cl(b * .52)]; }),
  };
}
