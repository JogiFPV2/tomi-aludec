import { h } from './dom';
import type { Backend } from '../services/backend';
import type { EventBus } from '../core/events';
import type { Balance } from '../core/balance';
import { modelById, type ModelDef } from '../data/models';
import { metalById } from '../data/metals';
import { viewCost, freeLeft } from '../game/instruction/limit';

/**
 * Instrukcja modelu: rysunek z góry (gdzie który metal, ile podbić, gdzie haki).
 * Każde otwarcie liczy się jako podgląd; po wyczerpaniu darmowych podglądów kolejne kosztują punkty
 * (o ile admin nie wyłączył limitu w balansie).
 */
export class InstructionService {
  private views: Record<string, number> = {}; private el: HTMLElement | null = null;
  constructor(private wrap: HTMLElement, private backend: Backend, private bus: EventBus, private balance: Balance) {
    backend.getInstructionViews().then(v => { this.views = { ...v, ...this.views }; }).catch(() => { /* zostaje 0 */ });
  }
  viewsOf(modelId: string) { return this.views[modelId] ?? 0; }

  open(modelId: string) {
    const def = modelById(modelId); if (!def || this.el) return;
    const bal = this.balance.instructions; const cost = viewCost(this.viewsOf(modelId), bal);
    const close = () => { this.el?.remove(); this.el = null; removeEventListener('keydown', key, true); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    addEventListener('keydown', key, true);
    const card = h('section', { class: 'panel instr-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Instrukcja modelu ${def.number}` });
    this.el = h('div', { class: 'instr', onpointerdown: (e: Event) => { if (e.target === this.el) close(); } }, card); this.wrap.append(this.el);
    const show = () => {
      // zapis podglądu: od razu lokalnie, na serwerze w tle
      this.views[modelId] = this.viewsOf(modelId) + 1; const n = this.views[modelId];
      this.backend.viewInstruction(modelId).then(v => { this.views[modelId] = Math.max(v, this.views[modelId]); }).catch(() => { /* brak sieci – liczymy lokalnie */ });
      if (cost) this.bus.emit('score:add', { delta: -cost, reason: `Dodatkowy podgląd instrukcji ${def.number}` });
      const left = freeLeft(n, bal);
      const note = left === null ? 'Podglądy bez limitu' : left > 0 ? `Podgląd ${n} z ${bal.freeViewsPerModel} darmowych` : cost ? `Podgląd ${n} · kosztował ${cost} pkt` : `To był ostatni darmowy podgląd – kolejne po ${bal.penaltyPerExtraView} pkt`;
      card.replaceChildren(
        h('header', { class: 'instr-h' }, h('div', {}, h('div', { class: 'eyebrow', text: `Instrukcja · ${note}` }), h('div', { class: 'title', text: `${def.number} · ${def.name}` })), h('button', { class: 'btn pri', type: 'button', text: 'Zamknij', onclick: close })),
        h('div', { class: 'instr-body' }, drawing(def), table(def)));
      (card.querySelector('button') as HTMLElement).focus();
    };
    if (!cost) { show(); return; }
    card.replaceChildren(
      h('div', { class: 'title', text: `Instrukcja ${def.number}` }),
      h('p', { text: `Wykorzystałeś już ${bal.freeViewsPerModel} darmowych podglądów instrukcji tego modelu. Każdy kolejny kosztuje ${cost} pkt.` }),
      h('div', { class: 'instr-a' }, h('button', { class: 'btn', type: 'button', text: 'Anuluj', onclick: close }), h('button', { class: 'btn pri', type: 'button', text: `Pokaż za ${cost} pkt`, onclick: show })));
    (card.querySelector('.btn.pri') as HTMLElement).focus();
  }
  dispose() { this.el?.remove(); this.el = null; }
}

/** Rysunek modelu z góry: wzór, miejsca metali (numery) i haki. */
function drawing(def: ModelDef): HTMLElement {
  const W = 560, pad = 34, k = (W - pad * 2) / def.inner.l, H = Math.round(def.inner.w * k + pad * 2);
  const cv = h('canvas', { class: 'instr-cv', width: W, height: H, role: 'img', 'aria-label': 'Rysunek modelu z góry z miejscami metali i haków' }) as HTMLCanvasElement;
  const c = cv.getContext('2d')!; const X = (x: number) => W / 2 + x * k, Z = (z: number) => H / 2 + z * k;
  c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(80,150,140,.25)'; c.lineWidth = 1; for (let x = 0; x < W; x += 14) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, H); c.stroke(); } for (let y = 0; y < H; y += 14) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(W, y + .5); c.stroke(); }
  c.strokeStyle = '#34323a'; c.lineWidth = 3; c.strokeRect(X(-def.inner.l / 2), Z(-def.inner.w / 2), def.inner.l * k, def.inner.w * k);
  c.fillStyle = 'rgba(224,87,61,.35)'; c.lineWidth = 1.5;
  for (const p of def.pattern) {
    c.beginPath();
    if (p.kind === 'halfCyl') { const lx = p.axis === 'x' ? p.len : p.r * 2, lz = p.axis === 'x' ? p.r * 2 : p.len; c.rect(X(p.x - lx / 2), Z(p.z - lz / 2), lx * k, lz * k); }
    else if (p.kind === 'cyl') c.arc(X(p.x), Z(p.z), p.r * k, 0, Math.PI * 2);
    else c.rect(X(p.x - p.w / 2), Z(p.z - p.d / 2), p.w * k, p.d * k);
    c.fill(); c.stroke();
  }
  c.font = '700 13px "JetBrains Mono", ui-monospace, monospace'; c.textAlign = 'center';
  def.metals.forEach((m, i) => {
    const s = metalById(m.metalId)?.size ?? [.12, .08, .1];
    c.fillStyle = '#2f6aa8'; c.fillRect(X(m.x - s[0] / 2), Z(m.z - s[1] / 2), s[0] * k, s[1] * k);
    c.fillStyle = '#fff'; c.strokeStyle = '#2f6aa8'; c.lineWidth = 2; c.beginPath(); c.arc(X(m.x), Z(m.z) - s[1] * k / 2 - 13, 11, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#2f6aa8'; c.fillText(String(i + 1), X(m.x), Z(m.z) - s[1] * k / 2 - 8.5);
  });
  c.fillStyle = '#d23a2a'; c.font = '700 20px Georgia, serif';
  for (const hk of def.hooks) c.fillText('Ω', X(hk.x), Z(hk.z) + 7);
  return cv;
}
function table(def: ModelDef): HTMLElement {
  const rows = def.metals.map((m, i) => { const md = metalById(m.metalId); return h('tr', {}, h('td', { class: 'num', text: String(i + 1) }), h('td', { text: m.slot }), h('td', {}, h('b', { text: m.metalId }), h('span', { class: 'dim', text: md ? ` · ${String(md.weightKg).replace('.', ',')} kg` : '' })), h('td', { class: 'num', text: `${m.taps}×` })); });
  return h('div', { class: 'instr-t' },
    h('table', { class: 'sumtab' }, h('thead', {}, h('tr', {}, h('th', { text: 'Nr' }), h('th', { text: 'Miejsce' }), h('th', { text: 'Metal' }), h('th', { text: 'Podbić' }))), h('tbody', {}, ...rows)),
    h('p', { class: 'dim small', text: `Haki Ω: ${def.hooks.length} szt. – wstaw, gdy masa ma ${Math.round(def.hookWindow[0] * 100)}–${Math.round(def.hookWindow[1] * 100)} cm. Niebieskie numery na rysunku to miejsca metali.` }));
}
