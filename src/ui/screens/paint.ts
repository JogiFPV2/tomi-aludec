import { h } from '../dom';
import type { Game } from '../../game/Game';
import type { EventBus } from '../../core/events';
import type { Balance } from '../../core/balance';
import { brush, coverage } from '../../game/paint/paint';

/** Malowanie rdzenia: widok formy z góry, farbę nakłada się palcem / myszką. Potem można ją podpalić. */
export class PaintController {
  private off: (() => void)[] = []; private close: (() => void) | null = null;
  constructor(private wrap: HTMLElement, private game: Game, private bus: EventBus, private balance: Balance) {
    this.off.push(bus.on('paint:open', ({ loadId }) => this.open(loadId)));
  }

  private open(loadId: string) {
    const l = this.game.yard.loads.find(x => x.id === loadId); if (!l || this.close) return;
    const bal = this.balance.paint, p = this.game.paintShop.paintOf(l), def = l.def;
    this.bus.emit('game:pause', { paused: true });
    const K = 16, W = p.nx * K, H = p.nz * K;
    const cv = h('canvas', { class: 'paint-cv', width: W, height: H, 'aria-label': 'Forma z góry – przeciągnij, żeby malować' }) as HTMLCanvasElement; const c = cv.getContext('2d')!;
    const pct = h('span', { class: 'num' }), bar = h('i'), hint = h('p', { class: 'dim small paint-hint' });
    const fireBtn = h('button', { class: 'btn fire', type: 'button', text: 'Podpal farbę', onclick: () => { if (this.game.paintShop.light(l)) done(); } }) as HTMLButtonElement;
    const sx = W / def.inner.l, sz = H / def.inner.w, X = (x: number) => W / 2 + x * sx, Z = (z: number) => H / 2 + z * sz;
    let cursor: { u: number; v: number } | null = null;
    const draw = () => {
      // masa formierska
      c.fillStyle = '#3d342d'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(${i % 2 ? '255,235,200' : '0,0,0'},.05)`; c.fillRect((i * 97) % W, (i * 53) % H, 3, 3); }
      // odcisk wzoru (zagłębienia)
      c.fillStyle = 'rgba(0,0,0,.28)'; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 2;
      for (const q of def.pattern) {
        c.beginPath();
        if (q.kind === 'halfCyl') { const lx = q.axis === 'x' ? q.len : q.r * 2, lz = q.axis === 'x' ? q.r * 2 : q.len; c.rect(X(q.x - lx / 2), Z(q.z - lz / 2), lx * sx, lz * sz); }
        else if (q.kind === 'cyl') c.ellipse(X(q.x), Z(q.z), q.r * sx, q.r * sz, 0, 0, Math.PI * 2);
        else c.rect(X(q.x - q.w / 2), Z(q.z - q.d / 2), q.w * sx, q.d * sz);
        c.fill(); c.stroke();
      }
      // siwa farba
      for (let j = 0; j < p.nz; j++) for (let i = 0; i < p.nx; i++) if (p.grid[j * p.nx + i]) { const n = ((i * 7 + j * 13) % 5) * 4; c.fillStyle = `rgba(${160 + n},${168 + n},${176 + n},.88)`; c.fillRect(i * K, j * K, K + .5, K + .5); }
      // haki
      c.strokeStyle = '#cfd6dc'; c.lineWidth = 4; for (const hk of l.form?.hooks ?? []) { c.beginPath(); c.arc(X(hk.x), Z(hk.z), 11, Math.PI * .75, Math.PI * 2.25); c.stroke(); }
      if (cursor) { c.strokeStyle = '#ffcf4d'; c.lineWidth = 3; c.beginPath(); c.ellipse(cursor.u * W, cursor.v * H, bal.brushR * W, bal.brushR * W, 0, 0, Math.PI * 2); c.stroke(); }
      const cov = coverage(p); pct.textContent = `${Math.round(cov * 100)}%`; bar.style.width = `${cov * 100}%`; bar.parentElement?.classList.toggle('ok', cov >= bal.minCover);
      fireBtn.disabled = p.state !== 'wet';
      hint.textContent = p.state === 'raw' ? 'Przeciągaj palcem albo myszką po formie – nakładasz siwą farbę. Pomaluj cały wierzch.'
        : cov < bal.minCover ? `Pomalowane ${Math.round(cov * 100)}% – na pełne punkty trzeba ${Math.round(bal.minCover * 100)}%.`
        : 'Rdzeń pomalowany. Podpal farbę, żeby szybko się wypaliła, albo zostaw – wyschnie sama, ale dużo wolniej.';
    };
    let pid = -1, last: { u: number; v: number } | null = null;
    const at = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height }; };
    const stroke = (a: { u: number; v: number }, b: { u: number; v: number }) => { const n = Math.max(1, Math.ceil(Math.hypot(b.u - a.u, b.v - a.v) / (bal.brushR * .5))); for (let i = 1; i <= n; i++) brush(p, a.u + (b.u - a.u) * i / n, a.v + (b.v - a.v) * i / n, bal); };
    cv.addEventListener('pointerdown', e => { pid = e.pointerId; cv.setPointerCapture(pid); last = at(e); cursor = last; brush(p, last.u, last.v, bal); draw(); });
    cv.addEventListener('pointermove', e => { const q = at(e); cursor = q; if (e.pointerId === pid && last) { stroke(last, q); last = q; } draw(); });
    const end = () => { pid = -1; last = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', () => { cursor = null; draw(); });
    const done = () => this.close?.();
    const root = h('div', { class: 'screen paint' },
      h('header', { class: 'panel mhead' },
        h('div', {}, h('div', { class: 'eyebrow', text: 'Malarnia rdzeni · siwa farba' }), h('div', { class: 'title', text: `Forma ${def.number}` })),
        h('div', { class: 'paint-cov' }, h('span', { class: 'dim small', text: 'Pomalowane' }), h('div', { class: 'bar' }, bar), pct),
        h('div', { class: 'paint-acts' }, fireBtn, h('button', { class: 'btn pri', type: 'button', text: 'Odejdź', onclick: done }))),
      h('div', { class: 'paint-stage' }, cv), hint);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
    addEventListener('keydown', key, true);
    this.wrap.append(root); draw();
    this.close = () => {
      this.close = null; removeEventListener('keydown', key, true); root.remove();
      this.bus.emit('game:pause', { paused: false });
      if (p.state === 'wet') this.bus.emit('toast', { text: `Farba na formie ${def.number} schnie sama (ok. ${Math.round(p.t / 60)} min). Podpalona wypaliłaby się w ${Math.round(bal.burnSec)} s.`, kind: 'info' });
    };
  }
  dispose() { this.close?.(); this.off.forEach(f => f()); }
}
