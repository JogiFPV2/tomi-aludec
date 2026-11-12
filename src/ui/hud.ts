import { h } from './dom';
import type { Game } from '../game/Game';
import type { EventBus } from '../core/events';
import type { Character } from '../services/backend';
import { V } from '../game/render/build';

/** Interfejs na ekranie gry: statystyki, podpowiedzi, panel suwnicy, sterowanie dotykowe, etykiety. */
export class Hud {
  root: HTMLElement;
  private labels: { el: HTMLElement; pos: () => ReturnType<typeof V> | null }[] = [];
  private prompt: HTMLButtonElement;
  private toasts: HTMLElement;
  private cranePanel: HTMLElement;
  private swingBar: HTMLElement; private swingTxt: HTMLElement; private heightTxt: HTMLElement; private loadTxt: HTMLElement;
  private gearBtns: HTMLButtonElement[] = [];
  private attachBtn: HTMLButtonElement;
  private craneTitle: HTMLElement; private choiceBox: HTMLElement; private liftBox: HTMLElement;
  private bubble: HTMLElement; private tiltTxt: HTMLElement; private liftState: HTMLElement; private chainBtns: HTMLElement;
  private remoteBtn: HTMLButtonElement;
  private roomEl: HTMLElement;
  private hoistPad: HTMLElement; private runBtn: HTMLButtonElement;
  private raf = 0; private offs: (() => void)[] = [];
  private lastToast = new Map<string, number>();
  private pointsEl: HTMLElement;

  constructor(parent: HTMLElement, private game: Game, bus: EventBus, character: Character, opts: { onLogout: () => void; dev: boolean }) {
    const touch = document.body.classList.contains('touch');
    this.roomEl = h('div', { class: 'dim small' });
    this.pointsEl = h('span', { class: 'num', text: `${character.points} pkt` });
    const stats = h('section', { class: 'panel stats' },
      h('div', { class: 'eyebrow', text: 'Tomi Aludec · zmiana I' }),
      h('div', { class: 'title', text: character.name }),
      h('div', { class: 'row' }, h('span', { class: 'dim', text: 'Sypacz' }), this.pointsEl),
      this.roomEl,
    );
    const menuBtn = h('button', { class: 'btn small', type: 'button', text: 'Wyloguj', onclick: () => opts.onLogout() });
    const fsBtn = h('button', { class: 'btn small', type: 'button', text: 'Pełny ekran', onclick: () => { const p = document.documentElement.requestFullscreen?.(); p?.catch(() => this.toast('Pełny ekran nie jest dostępny w tej przeglądarce')); } });
    const zoom = h('div', { class: 'zoom' },
      h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Oddal', text: '−', onclick: () => game.setZoom(game.zoom * 1.2) }),
      h('button', { class: 'btn icon', type: 'button', 'aria-label': 'Przybliż', text: '+', onclick: () => game.setZoom(game.zoom / 1.2) }));
    const topRight = h('div', { class: 'top-right' }, zoom, fsBtn, menuBtn);
    this.prompt = h('button', { class: 'prompt', type: 'button', hidden: true, onclick: () => game.input.fire('use') });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });

    // panel suwnicy
    this.swingBar = h('i'); this.swingTxt = h('span', { class: 'num' }); this.heightTxt = h('span', { class: 'num' }); this.loadTxt = h('span', { class: 'num' });
    for (const g of [1, 2] as const) this.gearBtns.push(h('button', { class: 'btn gear', type: 'button', text: g === 1 ? 'Bieg 1 · wolny' : 'Bieg 2 · szybki', onclick: () => game.remote?.setGear(g) }));
    this.attachBtn = h('button', { class: 'btn pri', type: 'button', text: 'Zaczep', onclick: () => game.input.fire('attach') });
    this.craneTitle = h('div', { class: 'eyebrow ctitle' });
    this.choiceBox = h('div', { class: 'choice', hidden: true });
    this.bubble = h('i'); this.tiltTxt = h('span', { class: 'num' }); this.liftState = h('div', { class: 'small' }); this.chainBtns = h('div', { class: 'chains' });
    const holdC = (label: string, key: string) => { const b = h('button', { class: 'btn hold', type: 'button', text: label }); const on = (e: Event) => { e.preventDefault(); game.input.hold(key, true); }; const off = () => game.input.hold(key, false); b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); return b; };
    this.liftBox = h('div', { class: 'lift', hidden: true },
      h('div', { class: 'row' }, h('span', { class: 'dim', text: 'Przechył formy' }), this.tiltTxt),
      h('div', { class: 'level' }, h('b'), h('u'), this.bubble), this.liftState,
      h('div', { class: 'dim small', text: 'Łańcuch:' }), this.chainBtns,
      h('div', { class: 'acts' }, holdC('Luzuj ▼', 'chain-down'), holdC('Skróć ▲', 'chain-up')));
    this.cranePanel = h('section', { class: 'panel crane', hidden: true },
      this.craneTitle,
      h('div', { class: 'gears' }, ...this.gearBtns),
      h('div', { class: 'row' }, h('span', { class: 'dim', text: 'Bujanie' }), this.swingTxt),
      h('div', { class: 'bar' }, this.swingBar),
      h('div', { class: 'row' }, h('span', { class: 'dim', text: 'Wysokość haka' }), this.heightTxt),
      h('div', { class: 'row' }, h('span', { class: 'dim', text: 'Ładunek' }), this.loadTxt),
      this.choiceBox, this.liftBox,
      h('div', { class: 'acts' }, this.attachBtn, h('button', { class: 'btn', type: 'button', text: 'Chodzenie', onclick: () => game.exitCrane() })),
      !touch ? h('div', { class: 'keys' }, ...[['W A S D', 'jazda'], ['R / F', 'hak góra / dół'], ['Q', 'zmiana biegu'], ['Spacja', 'zaczep / odczep'], ['1–4', 'wybór (zaczep / łańcuch)'], ['X / Z', 'skróć / luzuj łańcuch'], ['C / Esc', 'chodzenie z pilotem']].flatMap(([k, t]) => [h('span', { class: 'key', text: k }), h('span', { text: t })])) : null,
    );
    this.remoteBtn = h('button', { class: 'btn remote', type: 'button', hidden: true, onclick: () => game.toggleControl() });

    // sterowanie dotykowe
    const knob = h('i'); const joy = h('div', { class: 'joy', 'aria-label': 'Gałka ruchu' }, knob);
    let pid = -1; const R = 52;
    const setJoy = (e: PointerEvent) => { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / R, y = (e.clientY - r.top - r.height / 2) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } knob.style.transform = `translate(${x * R}px,${y * R}px)`; game.input.setJoystick(x, y, true); };
    joy.addEventListener('pointerdown', e => { pid = e.pointerId; joy.setPointerCapture(pid); setJoy(e); });
    joy.addEventListener('pointermove', e => { if (e.pointerId === pid) setJoy(e); });
    const endJoy = () => { pid = -1; knob.style.transform = ''; game.input.setJoystick(0, 0, false); };
    joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
    const holdBtn = (label: string, key: string) => { const b = h('button', { class: 'btn hold', type: 'button', text: label }); const on = (e: Event) => { e.preventDefault(); game.input.hold(key, true); }; const off = () => game.input.hold(key, false); b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); return b; };
    this.hoistPad = h('div', { class: 'hoist', hidden: true }, holdBtn('Hak ▲', 'hoist-up'), holdBtn('Hak ▼', 'hoist-down'));
    this.runBtn = h('button', { class: 'btn run', type: 'button', text: 'Bieg', onclick: () => { game.input.runToggle = !game.input.runToggle; this.runBtn.classList.toggle('on', game.input.runToggle); } });
    const touchUi = touch ? h('div', { class: 'touch-ui' }, joy, this.hoistPad, this.runBtn) : null;
    const keysHelp = !touch ? h('section', { class: 'panel help' }, h('div', { class: 'keys' }, ...[['W A S D', 'chodzenie'], ['Shift', 'bieg'], ['E', 'użyj'], ['Kółko myszy', 'przybliż / oddal']].flatMap(([k, t]) => [h('span', { class: 'key', text: k }), h('span', { text: t })]))) : null;
    const dev = opts.dev ? h('div', { class: 'devbadge', text: 'Wersja testowa: suwnica odblokowana dla wszystkich (docelowo od 500 pkt)' }) : null;
    const labelLayer = h('div', { class: 'labels' });

    this.root = h('div', { class: 'hud' }, labelLayer, stats, topRight, this.cranePanel, this.prompt, this.remoteBtn, this.toasts, keysHelp, touchUi, dev);
    parent.append(this.root);

    // etykiety w świecie
    for (const l of game.world.labels) this.addLabel(labelLayer, l.text, () => l.pos, 'place');
    this.addLabel(labelLayer, character.name, () => game.playerPos().add(V(0, 2.3, 0)), 'me');
    this.addLabel(labelLayer, 'Tu możesz zaczepić', () => { if (game.mode !== 'crane' || !game.remote || game.remote.attached) return null; const o = game.remote.options(); return o.length ? game.remote.hookWorld().add(V(0, .5, 0)) : null; }, 'hint');
    for (const c of game.cranes) this.addLabel(labelLayer, c.name, () => game.mode === 'crane' && game.remote !== c ? null : V(c.state.x, 3.9, c.state.z), 'crane-tag').style.setProperty('--cc', c.station.color);

    this.offs.push(
      bus.on('toast', t => this.toast(t.text, t.kind)),
      bus.on('points:changed', p => { this.pointsEl.textContent = `${p.points} pkt`; this.toast(`${p.delta >= 0 ? '+' : ''}${p.delta} pkt – ${p.reason ?? 'sypanie'}`, p.delta >= 0 ? 'ok' : 'bad'); }),
      bus.on('crane:choice', c => { this.choiceBox.hidden = !c; this.choiceBox.replaceChildren(...(c ? [h('div', { class: 'dim small', text: 'Za co zaczepić?' }), ...c.options.map((t, i) => h('button', { class: 'btn pri', type: 'button', text: `${i + 1}. ${t}`, onclick: () => game.remote?.pick(i) }))] : [])); }),
      bus.on('remote:changed', r => { this.remoteBtn.hidden = !r; if (r) { this.remoteBtn.style.setProperty('--cc', r.color); this.remoteBtn.innerHTML = `<span class="key">${touch ? '' : 'C'}</span> Steruj suwnicą`; } }),
      bus.on('game:pause', ({ paused }) => { this.root.classList.toggle('paused', paused); }),
      bus.on('interact:available', it => { this.prompt.hidden = !it; if (it) this.prompt.innerHTML = `<span class="key">${touch ? 'Dotknij' : 'E'}</span> ${it.label}`; }),
      bus.on('crane:enter', () => this.setCraneMode(true)),
      bus.on('crane:exit', () => this.setCraneMode(false)),
      bus.on('crane:locked', p => this.toast(`Suwnica wymaga uprawnień: ${p.needPoints} pkt (masz ${p.havePoints}).`, 'bad')),
    );
    this.tick();
  }

  private addLabel(layer: HTMLElement, text: string, pos: () => ReturnType<typeof V> | null, cls: string) {
    const el = h('div', { class: 'wlabel ' + cls, text }); layer.append(el); this.labels.push({ el, pos }); return el;
  }

  private setCraneMode(on: boolean) {
    this.cranePanel.hidden = !on; this.hoistPad.hidden = !on; this.runBtn.hidden = on; this.remoteBtn.classList.toggle('hide-in-crane', on);
    const c = this.game.remote;
    if (on && c) { this.cranePanel.style.setProperty('--cc', c.station.color); this.craneTitle.textContent = `${c.name} · pilot`; this.toast('Steruj pilotem. Bieg 1 – precyzyjnie, bieg 2 – szybko, ale ładunek się buja.'); }
  }

  toast(text: string, kind: 'ok' | 'bad' | 'info' = 'info') {
    const now = performance.now(); if ((this.lastToast.get(text) ?? 0) > now - 2500) return; this.lastToast.set(text, now);
    const el = h('div', { class: 'toast ' + kind, text }); this.toasts.prepend(el);
    while (this.toasts.children.length > 3) this.toasts.lastElementChild!.remove();
    setTimeout(() => el.remove(), kind === 'bad' ? 5000 : 3800);
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const g = this.game;
    for (const l of this.labels) {
      const p = l.pos(); if (!p) { l.el.style.display = 'none'; continue; }
      const s = g.project(p); if (!s.visible) { l.el.style.display = 'none'; continue; }
      l.el.style.display = ''; l.el.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,-100%)`;
    }
    if (this.roomEl.textContent !== g.room) this.roomEl.textContent = g.room;
    const c = g.remote;
    if (g.mode === 'crane' && c) {
      const s = c.state; const amp = c.swing();
      this.swingTxt.textContent = amp.toFixed(2).replace('.', ',') + ' m';
      this.swingBar.style.width = Math.min(100, amp / .6 * 100) + '%';
      this.swingBar.parentElement!.classList.toggle('bad', amp > .25);
      this.heightTxt.textContent = c.hookWorld().y.toFixed(2).replace('.', ',') + ' m';
      this.loadTxt.textContent = c.attached ? `${c.attachKind === 'form' ? 'Forma' : c.attached.name} · ${s.load?.resting ? 'stoi' : 'w górze'}` : 'brak';
      this.gearBtns.forEach((b, i) => b.classList.toggle('on', s.gear === i + 1));
      this.attachBtn.textContent = c.attached ? 'Odczep' : 'Zaczep';
      this.attachBtn.disabled = !c.attached && !c.options().length;
      const lift = c.lift; this.liftBox.hidden = !lift;
      if (lift) {
        const t = c.tilt()!; const bal = g.balance.lift;
        this.tiltTxt.textContent = t.mag.toFixed(1).replace('.', ',') + '°';
        const k = 34 / bal.crackDeg; this.bubble.style.transform = `translate(${Math.max(-40, Math.min(40, -t.x * k))}px,${Math.max(-40, Math.min(40, t.z * k))}px)`;
        this.liftBox.classList.toggle('warn', t.mag > bal.warnDeg); this.liftBox.classList.toggle('danger', t.mag > bal.crackDeg * .75);
        this.liftState.textContent = lift.inModel ? `W modelu: ${Math.round(lift.lifted / lift.depth * 100)}% · kara ${Math.round(lift.penalty)} pkt` : 'Forma wyjęta – odłóż ją na paletę';
        if (this.chainBtns.childElementCount !== lift.hooks.length) this.chainBtns.replaceChildren(...lift.hooks.map((hk, i) => h('button', { class: 'btn small', type: 'button', text: `${i + 1} · ${hk.x < -.05 ? 'lewy' : hk.x > .05 ? 'prawy' : hk.z < 0 ? 'tylny' : 'przedni'}`, onclick: () => c.selectChain(i) })));
        [...this.chainBtns.children].forEach((b, i) => b.classList.toggle('on', lift.sel === i));
      }
    }
  };

  dispose() { cancelAnimationFrame(this.raf); this.offs.forEach(f => f()); this.root.remove(); }
}
