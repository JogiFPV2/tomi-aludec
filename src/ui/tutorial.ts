import { h } from './dom';
import type { Game } from '../game/Game';
import type { EventBus } from '../core/events';
import { STATIONS, SLOT_X, inPaintZone, PAINT } from '../data/layout';

/**
 * Samouczek: krótka lista kroków „co i w jakiej kolejności”. Każdy krok zalicza się sam,
 * gdy gracz zrobi to, o co chodzi. Zawsze można go pominąć; wraca się do niego z menu.
 */
interface Flags { poured: boolean; boxOpened: boolean; start: { x: number; z: number } }
export interface Step { title: string; text: string; touch?: string; done: (g: Game, f: Flags) => boolean }

const KEY = 'tomi.samouczek';
export const tutorialSeen = () => { try { return localStorage.getItem(KEY) === 'koniec'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(KEY, 'koniec'); } catch { /* tryb prywatny */ } };

const onRoller = (g: Game) => g.yard.loads.some(l => l.kind === 'model' && !l.heldBy && Math.abs(l.y - .5) < .02 && STATIONS.some(st => Math.abs(l.z - st.z) < .25 && SLOT_X.some(sx => Math.abs(l.x - (st.x + sx)) < .35)));

export const STEPS: Step[] = [
  { title: 'Rozejrzyj się', text: 'Chodzisz klawiszami W A S D (Shift – bieg). Żółty przycisk na dole to zawsze najbliższa czynność (klawisz E).', touch: 'Chodzisz gałką po lewej. Żółty przycisk po prawej to zawsze najbliższa czynność.',
    done: (g, f) => Math.hypot(g.playerPos().x - f.start.x, g.playerPos().z - f.start.z) > 3 },
  { title: 'Weź pustą paletę', text: 'Podejdź do palety i wybierz „Podnieś paletę” albo weź paleciak i wjedź widłami pod paletę. Elektryczny paleciak jest szybszy.',
    done: g => g.transport.hand > 0 || !!g.transport.holding?.carry },
  { title: 'Skrzynia z metalami', text: 'Zawieź paletę do skrzyni z metalami do swojego modelu (dymek „Metale do …”) i wybierz „Szukaj metali”. Niesioną w rękach paletę najpierw odłóż obok.',
    done: (_g, f) => f.boxOpened },
  { title: 'Przełóż metale', text: 'Otwórz „Instrukcję modelu”, sprawdź numery i przeciągnij potrzebne metale na paletę. Co dziesiąty metal w skrzyni jest do innego modelu.',
    done: g => !g.metalSession && (g.transport.metalStacks().length > 0 || g.transport.handMetals.length > 0) },
  { title: 'Metale pod stanowisko', text: 'Zawieź paletę z metalami obok stanowiska sypacza i odstaw ją tam.',
    done: g => STATIONS.some(st => g.transport.metalStacks(st.x, st.z, g.balance.metals.stationReach).some(s => !s.jack)) },
  { title: 'Pilot suwnicy', text: 'Weź pilota ze stojaka przy stanowisku. Wisi potem przy pasie – sterujesz suwnicą z dowolnego miejsca (klawisz C).', touch: 'Weź pilota ze stojaka przy stanowisku. Wisi potem przy pasie – suwnicą sterujesz przyciskiem „Steruj”.',
    done: g => !!g.remote },
  { title: 'Model na rolotok', text: 'Suwnicą zaczep model za uchwyty, podnieś, przewieź nad rolotok, opuść i odczep. Na rolotoku mieszczą się 3 modele.',
    done: g => onRoller(g) },
  { title: 'Sypanie', text: 'Podejdź do mieszarki. Najpierw ułóż metale w modelu („+”, numery są w instrukcji), potem Start, prowadź ramię, podbijaj metale, wstaw haki Ω i zakończ sypanie.',
    done: (_g, f) => f.poured },
  { title: 'Wyciągnij formę', text: 'Suwnicą zaczep za haki formy i podnoś powoli. Pilnuj poziomu – przechył to kara, a duży przechył to pęknięta forma.',
    done: g => g.yard.loads.some(l => l.kind === 'form') },
  { title: 'Forma na paletę', text: 'Odłóż formę na pustą paletę przy stanowisku i odczep. Dalej formą zajmuje się malarz rdzeni.',
    done: g => g.yard.loads.some(l => l.kind === 'form' && !l.heldBy && g.transport.palletTopAt(l.x, l.z) !== null && Math.abs(l.y - g.transport.palletTopAt(l.x, l.z)!) < .04) },
  { title: 'Forma do malarni', text: `Paleciakiem zabierz paletę z formą i zawieź ją do strefy „${PAINT.name}” (niebieska ramka w południowej części hali). Odstaw ją tam.`,
    done: g => g.yard.loads.some(l => l.kind === 'form' && !l.heldBy && inPaintZone(l.x, l.z) && !g.transport.holding?.carry) },
  { title: 'Pomaluj i podpal', text: 'Podejdź do formy i wybierz „Maluj rdzeń”. Pokryj cały wierzch siwą farbą, potem „Podpal farbę” – gdy ogień zgaśnie, forma jest gotowa.',
    done: g => g.yard.loads.some(l => l.paint?.state === 'burning' || l.paint?.state === 'ready') },
];

export class Tutorial {
  private el: HTMLElement; private timer = 0; private i = 0; private flags: Flags;
  private off: (() => void)[] = [];
  constructor(root: HTMLElement, private game: Game, bus: EventBus, private touch: boolean) {
    this.flags = { poured: false, boxOpened: false, start: { x: game.playerPos().x, z: game.playerPos().z } };
    this.el = h('section', { class: 'panel tutor', hidden: true, 'aria-live': 'polite' });
    root.append(this.el);
    this.off.push(bus.on('pour:finished', () => { this.flags.poured = true; }), bus.on('metals:open', () => { this.flags.boxOpened = true; }));
  }
  get active() { return !this.el.hidden; }

  start() {
    this.i = 0; this.flags = { poured: false, boxOpened: false, start: { x: this.game.playerPos().x, z: this.game.playerPos().z } };
    this.el.hidden = false; this.render(); clearInterval(this.timer);
    this.timer = window.setInterval(() => this.poll(), 400);
  }
  /** Pomiń / zakończ – więcej nie pokaże się sam (można wrócić z menu). */
  stop() { clearInterval(this.timer); this.el.hidden = true; markSeen(); }

  private poll() {
    const s = STEPS[this.i]; if (!s) return;
    let ok = false; try { ok = s.done(this.game, this.flags); } catch { ok = false; }
    if (ok) this.go(this.i + 1, true);
  }
  private go(i: number, auto = false) {
    this.i = Math.max(0, Math.min(STEPS.length, i)); this.render();
    if (auto) { this.el.classList.remove('flash'); void this.el.offsetWidth; this.el.classList.add('flash'); }
  }
  private render() {
    const s = STEPS[this.i];
    if (!s) {
      this.el.replaceChildren(h('div', { class: 'eyebrow', text: 'Samouczek' }), h('div', { class: 'tutor-t', text: 'To cały cykl pracy' }),
        h('p', { text: 'Paleta → metale → model na rolotok → sypanie → forma na paletę → malarnia → farba i ogień. Samouczek znajdziesz zawsze w menu.' }),
        h('div', { class: 'tutor-a end' }, h('button', { class: 'btn pri', type: 'button', text: 'Zamknij', onclick: () => this.stop() })));
      clearInterval(this.timer); markSeen(); return;
    }
    this.el.replaceChildren(
      h('div', { class: 'row' }, h('span', { class: 'eyebrow', text: `Samouczek · krok ${this.i + 1} z ${STEPS.length}` }), h('button', { class: 'btn small', type: 'button', text: 'Pomiń', 'aria-label': 'Pomiń samouczek', onclick: () => this.stop() })),
      h('div', { class: 'tutor-t', text: s.title }), h('p', { text: (this.touch && s.touch) || s.text }),
      h('div', { class: 'tutor-a' },
        h('button', { class: 'btn small', type: 'button', text: 'Wstecz', disabled: this.i === 0, onclick: () => this.go(this.i - 1) }),
        h('button', { class: 'btn small', type: 'button', text: 'Dalej', onclick: () => this.go(this.i + 1) })));
  }
  dispose() { clearInterval(this.timer); this.off.forEach(f => f()); this.el.remove(); }
}
