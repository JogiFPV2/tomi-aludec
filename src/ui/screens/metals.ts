import { h } from '../dom';
import type { Game } from '../../game/Game';
import type { EventBus } from '../../core/events';
import type { Balance } from '../../core/balance';
import { modelById } from '../../data/models';
import { metalById } from '../../data/metals';
import { needFor, countBy, moveItem, setsIn } from '../../game/metals/box';

/**
 * Szukanie metali: z lewej paleta gracza, z prawej zawartość skrzyni.
 * Metale przeciąga się palcem / myszką (albo dotyka – wtedy przeskakują na drugą stronę).
 */
export class MetalsController {
  private off: (() => void)[] = []; private close: (() => void) | null = null;
  constructor(private wrap: HTMLElement, private game: Game, private bus: EventBus, private balance: Balance) {
    this.off.push(bus.on('metals:open', () => this.open()));
  }

  private open() {
    const ses = this.game.metalSession; if (!ses || this.close) return;
    const def = modelById(ses.box.modelId)!; const need = needFor(def); const cap = this.balance.metals.palletCap;
    const pal = ses.pallet.metals, box = ses.box.items;
    this.bus.emit('game:pause', { paused: true });

    const zonePal = h('div', { class: 'mzone', 'data-zone': 'pal' }), zoneBox = h('div', { class: 'mzone', 'data-zone': 'box' });
    const palTitle = h('span'), boxTitle = h('span'), needEl = h('div', { class: 'mneed' }), setsEl = h('span', { class: 'num' });
    const tile = (id: string, zone: 'pal' | 'box', i: number) => {
      const md = metalById(id); const s = md?.size ?? [.12, .08, .1];
      const el = h('button', { class: 'mtile' + (id.startsWith('U') ? ' uni' : ''), type: 'button', 'data-zone': zone, 'data-i': i, 'aria-label': `${id} – ${md?.name ?? ''}. Przełóż ${zone === 'box' ? 'na paletę' : 'do skrzyni'}` },
        h('i', { class: 'mshape', style: `width:${Math.round(s[0] * 300)}px;height:${Math.round(s[1] * 300)}px` }),
        h('b', { text: id }), h('span', { class: 'dim', text: `${String(md?.weightKg ?? '?').replace('.', ',')} kg` }));
      return el;
    };
    const render = () => {
      zonePal.replaceChildren(...pal.map((id, i) => tile(id, 'pal', i)), ...(pal.length ? [] : [h('p', { class: 'dim mempty', text: 'Paleta jest pusta. Przeciągnij tu metale ze skrzyni.' })]));
      zoneBox.replaceChildren(...box.map((id, i) => tile(id, 'box', i)));
      palTitle.textContent = `Twoja paleta · ${pal.length}/${cap}`; boxTitle.textContent = `Skrzynia · ${box.length} szt.`;
      const have = countBy(pal);
      needEl.replaceChildren(...Object.entries(need).map(([id, n]) => h('span', { class: 'chip' + ((have[id] ?? 0) >= n ? ' ok' : '') }, h('b', { text: id }), ` ${have[id] ?? 0} / ${n}`)));
      const wrong = pal.filter(id => !(id in need)).length;
      setsEl.textContent = `Kompletów na formę: ${setsIn(pal, need)}` + (wrong ? ` · inne metale: ${wrong}` : '');
    };
    const move = (zone: string, i: number) => {
      const ok = zone === 'box' ? moveItem(box, pal, i, cap) : moveItem(pal, box, i);
      if (!ok && zone === 'box') this.bus.emit('toast', { text: `Paleta jest pełna (${cap} sztuk).`, kind: 'bad' });
      render();
    };

    // przeciąganie: palec / mysz; krótkie dotknięcie = przełóż na drugą stronę
    let drag: { el: HTMLElement; ghost: HTMLElement | null; x: number; y: number; zone: string; i: number; pid: number } | null = null;
    const down = (e: PointerEvent) => {
      const t = (e.target as HTMLElement).closest('.mtile') as HTMLElement | null; if (!t) return;
      drag = { el: t, ghost: null, x: e.clientX, y: e.clientY, zone: t.dataset.zone!, i: Number(t.dataset.i), pid: e.pointerId };
    };
    const moveEv = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) { const g = drag.el.cloneNode(true) as HTMLElement; g.classList.add('mghost'); root.append(g); drag.ghost = g; drag.el.classList.add('lifted'); }
      if (drag.ghost) { e.preventDefault(); drag.ghost.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; const z = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mcol'); for (const c of [colPal, colBox]) c.classList.toggle('over', c === z && c.dataset.zone !== drag.zone); }
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return; const d = drag; drag = null;
      for (const c of [colPal, colBox]) c.classList.remove('over');
      if (!d.ghost) { move(d.zone, d.i); return; }
      d.ghost.remove(); d.el.classList.remove('lifted');
      const z = (document.elementFromPoint(e.clientX, e.clientY)?.closest('.mcol') as HTMLElement | null)?.dataset.zone;
      if (z && z !== d.zone) move(d.zone, d.i);
    };
    const cancel = () => { if (drag?.ghost) { drag.ghost.remove(); drag.el.classList.remove('lifted'); } drag = null; };

    const colPal = h('section', { class: 'panel mcol', 'data-zone': 'pal' }, h('header', { class: 'mcol-h' }, palTitle, setsEl), zonePal);
    const colBox = h('section', { class: 'panel mcol', 'data-zone': 'box' }, h('header', { class: 'mcol-h' }, boxTitle, h('span', { class: 'dim small', text: 'ok. 10% to metale do innych modeli' })), zoneBox);
    const done = () => this.close?.();
    const root = h('div', { class: 'screen metals' },
      h('header', { class: 'panel mhead' },
        h('div', {}, h('div', { class: 'eyebrow', text: 'Skrzynia z metalami' }), h('div', { class: 'title', text: `${def.number} · ${def.name}` })),
        h('div', { class: 'mneed-wrap' }, h('span', { class: 'dim small', text: 'Na jedną formę:' }), needEl),
        h('button', { class: 'btn pri', type: 'button', text: 'Gotowe', onclick: done })),
      h('div', { class: 'mcols' }, colPal, colBox),
      h('p', { class: 'mhelp dim small', text: 'Przeciągnij metal na drugą stronę albo po prostu go dotknij. Czytaj numery – w skrzyni leżą też metale do innych modeli.' }));
    root.addEventListener('pointerdown', down); root.addEventListener('pointermove', moveEv); root.addEventListener('pointerup', up); root.addEventListener('pointercancel', cancel);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
    addEventListener('keydown', key, true);
    this.wrap.append(root); render();
    (root.querySelector('.btn.pri') as HTMLElement).focus();
    this.close = () => {
      this.close = null; removeEventListener('keydown', key, true); root.remove();
      this.bus.emit('game:pause', { paused: false }); this.game.closeBox();
      if (pal.length) this.bus.emit('toast', { text: `Na palecie ${pal.length} szt. metali. Zawieź ją obok stanowiska i odstaw – wtedy ułożysz metale w modelu.`, kind: 'ok' });
    };
  }

  dispose() { this.close?.(); this.off.forEach(f => f()); }
}
