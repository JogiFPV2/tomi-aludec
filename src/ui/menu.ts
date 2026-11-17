import { h } from './dom';
import { settings, LIMITS, type Settings } from '../core/settings';

/** Menu gry z ustawieniami: kamera, sterowanie, ekran. Zmiany działają od razu i zapisują się w przeglądarce. */
export function buildMenu(o: { onClose: () => void; onLogout?: () => void; onMainMenu?: () => void; onFullscreen: () => void; onTutorial?: () => void; touch: boolean; title?: string; closeLabel?: string }): { el: HTMLElement; dispose: () => void } {
  type NumKey = keyof typeof LIMITS;
  const sync: ((s: Settings) => void)[] = [];
  const slider = (key: NumKey, label: string, hint: string, fmt: (v: number) => string, step: number) => {
    const out = h('span', { class: 'num' });
    const inp = h('input', { type: 'range', min: LIMITS[key][0], max: LIMITS[key][1], step, 'aria-label': label, oninput: () => settings.set({ [key]: Number(inp.value) }) });
    sync.push(s => { inp.value = String(s[key]); out.textContent = fmt(s[key]); });
    return h('label', { class: 'set' }, h('span', { class: 'set-h' }, h('span', { text: label }), out), inp, h('span', { class: 'dim small', text: hint }));
  };
  const toggle = (key: 'leftHanded' | 'grain' | 'labels', label: string, hint: string) => {
    const btn = h('button', { class: 'btn switch', type: 'button', role: 'switch', onclick: () => settings.set({ [key]: !settings.v[key] }) });
    sync.push(s => { btn.setAttribute('aria-checked', String(s[key])); btn.classList.toggle('on', s[key]); btn.textContent = s[key] ? 'Włączone' : 'Wyłączone'; });
    return h('div', { class: 'set row2' }, h('div', {}, h('div', { class: 'set-h', text: label }), h('span', { class: 'dim small', text: hint })), btn);
  };
  const pct = (v: number) => Math.round(v * 100) + '%';
  const card = h('section', { class: 'panel menu-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Menu gry' },
    h('header', { class: 'menu-h' }, h('div', { class: 'title', text: o.title ?? 'Menu' }), h('button', { class: 'btn pri', type: 'button', text: o.closeLabel ?? 'Wróć do gry', onclick: o.onClose })),
    h('div', { class: 'menu-body' },
      o.onTutorial ? h('div', { class: 'set row2' }, h('div', {}, h('div', { class: 'set-h', text: 'Samouczek' }), h('span', { class: 'dim small', text: 'Co i w jakiej kolejności robić – krok po kroku.' })), h('button', { class: 'btn', type: 'button', text: 'Uruchom', onclick: () => o.onTutorial?.() })) : null,
      h('h3', { text: 'Kamera' }),
      slider('camTilt', 'Kąt kamery', '12° – prawie z góry, 60° – mocno ukośnie, widać twarze i boki maszyn.', v => v.toFixed(0) + '°', 1),
      h('h3', { text: 'Sterowanie' }),
      slider('moveSens', 'Czułość chodzenia', 'Mniej = spokojniejsza gałka: pełna prędkość dopiero przy krawędzi.', pct, .05),
      slider('armSens', 'Czułość ramienia mieszarki', 'Jak szybko ramię jedzie przy sypaniu.', pct, .05),
      o.touch ? toggle('leftHanded', 'Układ dla leworęcznych', 'Gałka po prawej, przyciski akcji po lewej.') : null,
      h('h3', { text: 'Dźwięk' }),
      slider('volume', 'Głośność', 'Wszystkie dźwięki gry. 0% – wyciszone.', pct, .05),
      slider('ambience', 'Tło hali', 'Szum, buczenie i dudnienie hali (bez uderzeń i wołań).', pct, .05),
      h('h3', { text: 'Ekran' }),
      slider('uiScale', 'Wielkość przycisków i napisów', 'Większe łatwiej trafić palcem, mniejsze mniej zasłaniają.', pct, .05),
      toggle('labels', 'Napisy nad miejscami', 'Nazwy stanowisk, drzwi i maszyn na hali.'),
      toggle('grain', 'Papierowe ziarno', 'Faktura papieru i przyciemnione rogi obrazu.'),
    ),
    h('footer', { class: 'menu-f' },
      h('button', { class: 'btn', type: 'button', text: 'Pełny ekran', onclick: o.onFullscreen }),
      h('button', { class: 'btn', type: 'button', text: 'Przywróć domyślne', onclick: () => settings.reset() }),
      o.onMainMenu ? h('button', { class: 'btn', type: 'button', text: 'Menu główne', onclick: o.onMainMenu }) : null,
      o.onLogout ? h('button', { class: 'btn danger', type: 'button', text: 'Wyloguj', onclick: o.onLogout }) : null,
    ),
  );
  const el = h('div', { class: 'menu', hidden: true, onpointerdown: (e: Event) => { if (e.target === el) o.onClose(); } }, card);
  const off = settings.watch(s => sync.forEach(f => f(s)));
  return { el, dispose: off };
}
