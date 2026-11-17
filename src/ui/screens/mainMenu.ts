import * as THREE from 'three';
import { h } from '../dom';
import { Materials } from '../../game/render/materials';
import { Builder } from '../../game/render/build';
import { buildAvatar } from '../../game/character/avatar';
import { buildMenu } from '../menu';
import { MAX_CHARACTERS, type Backend, type Character } from '../../services/backend';

/**
 * Menu główne po zalogowaniu: wejście na halę, ustawienia, postacie (lista, wybór aktywnej) i kreator.
 * Portrety postaci renderowane raz do obrazków (jeden wspólny renderer – lekko dla telefonu).
 */
export interface MainMenuOpts { backend: Backend; email: string; lowQ: boolean; touch: boolean; onPlay: (c: Character) => void; onCreate: () => void; onLogout: () => void }

export function mainMenuScreen(root: HTMLElement, o: MainMenuOpts): () => void {
  let chars: Character[] = []; let view: 'home' | 'chars' = 'home'; let busy = false;
  const portraits = new Map<string, string>();
  const shot = portraitMaker(o.lowQ);

  const msg = h('p', { class: 'form-msg', role: 'status' });
  const body = h('div', { class: 'mm-body' });
  const settings = buildMenu({ touch: o.touch, title: 'Ustawienia', closeLabel: 'Zamknij', onClose: () => { settings.el.hidden = true; }, onFullscreen: () => { document.documentElement.requestFullscreen?.()?.catch(() => { msg.textContent = 'Pełny ekran nie jest dostępny w tej przeglądarce.'; }); } });
  const screen = h('div', { class: 'screen mainmenu' },
    h('header', { class: 'mm-head' },
      h('h1', { class: 'logo' }, 'Tomi ', h('b', { text: 'Aludec' })),
      h('div', { class: 'mm-user' }, h('span', { class: 'dim small', text: o.email }), h('button', { class: 'btn small', type: 'button', text: 'Wyloguj', onclick: o.onLogout }))),
    body, msg, settings.el);
  root.append(screen);

  const portrait = (c: Character) => {
    let src = portraits.get(c.id + c.appearance.skin + c.appearance.hairStyle);
    if (!src) { src = shot(c); portraits.set(c.id + c.appearance.skin + c.appearance.hairStyle, src); }
    return h('img', { class: 'mm-portrait', src, alt: `Portret postaci ${c.name}` });
  };
  const active = () => chars.find(c => c.is_active) ?? chars[0] ?? null;

  const render = () => {
    const a = active(); body.classList.toggle('list', view === 'chars');
    if (view === 'home') {
      const playBtn = h('button', { class: 'btn pri mm-big', type: 'button', text: a ? 'Wejdź na halę' : 'Stwórz pierwszą postać', onclick: () => a ? o.onPlay(a) : o.onCreate() });
      body.replaceChildren(
        h('nav', { class: 'mm-nav', 'aria-label': 'Menu główne' },
          playBtn,
          h('button', { class: 'btn mm-item', type: 'button', disabled: !chars.length, onclick: () => { view = 'chars'; render(); } }, h('span', { text: 'Postacie' }), h('span', { class: 'num dim', text: `${chars.length}/${MAX_CHARACTERS}` })),
          h('button', { class: 'btn mm-item', type: 'button', text: 'Kreator postaci', disabled: chars.length >= MAX_CHARACTERS, onclick: o.onCreate }),
          h('button', { class: 'btn mm-item', type: 'button', text: 'Ustawienia', onclick: () => { settings.el.hidden = false; (settings.el.querySelector('button') as HTMLElement | null)?.focus(); } })),
        a ? h('section', { class: 'panel mm-card' },
              h('div', { class: 'eyebrow', text: 'Aktywna postać' }), portrait(a),
              h('div', { class: 'title', text: a.name }),
              h('div', { class: 'row' }, h('span', { class: 'dim', text: 'Punkty' }), h('span', { class: 'num mm-pts', text: `${a.points} pkt` })),
              h('div', { class: 'row' }, h('span', { class: 'dim', text: 'Przepracowane zmiany' }), h('span', { class: 'num', text: String(a.shift_count) })))
          : h('section', { class: 'panel mm-card empty' }, h('div', { class: 'title', text: 'Nie masz jeszcze postaci' }), h('p', { class: 'dim', text: 'Stwórz pracownika formierni w kreatorze – potem wejdziesz nim na halę.' })));
      playBtn.focus();
    } else {
      const list = chars.map(c => h('article', { class: 'panel mm-char' + (c.is_active ? ' on' : '') },
        portrait(c),
        h('div', { class: 'mm-char-t' }, h('div', { class: 'title', text: c.name }), h('span', { class: 'num dim', text: `${c.points} pkt · zmiany: ${c.shift_count}` })),
        c.is_active ? h('span', { class: 'mm-badge', text: 'Aktywna' })
          : h('button', { class: 'btn', type: 'button', text: 'Ustaw jako aktywną', onclick: () => choose(c) })));
      if (chars.length < MAX_CHARACTERS) list.push(h('button', { class: 'panel mm-char add', type: 'button', onclick: o.onCreate }, h('span', { class: 'mm-plus', text: '+' }), h('span', { text: 'Nowa postać' })));
      body.replaceChildren(h('div', { class: 'mm-chars-h' }, h('button', { class: 'btn', type: 'button', text: '‹ Wróć', onclick: () => { view = 'home'; render(); } }), h('div', { class: 'title', text: 'Twoje postacie' }), h('span', { class: 'dim small', text: `${chars.length} z ${MAX_CHARACTERS}` })), h('div', { class: 'mm-chars' }, ...list));
    }
  };
  const choose = async (c: Character) => {
    if (busy) return; busy = true; msg.textContent = 'Zmieniam aktywną postać…'; msg.className = 'form-msg';
    const r = await o.backend.setActiveCharacter(c.id).catch(() => ({ ok: false, error: 'Brak połączenia z serwerem gry.' }));
    busy = false;
    if (!r.ok) { msg.textContent = r.error ?? 'Nie udało się.'; msg.className = 'form-msg bad'; return; }
    for (const x of chars) x.is_active = x.id === c.id;
    msg.textContent = `Aktywna postać: ${c.name}.`; msg.className = 'form-msg ok'; render();
  };
  const load = async () => {
    body.replaceChildren(h('div', { class: 'spinner' }));
    try { chars = await o.backend.listCharacters(); } catch { msg.textContent = 'Nie udało się wczytać postaci. Sprawdź internet.'; msg.className = 'form-msg bad'; }
    render();
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (!settings.el.hidden) settings.el.hidden = true; else if (view === 'chars') { view = 'home'; render(); } } };
  addEventListener('keydown', key);
  load();
  return () => { removeEventListener('keydown', key); settings.dispose(); shot.dispose(); screen.remove(); };
}

/** Jeden renderer do portretów: buduje postać, robi zdjęcie głowy i ramion, zwraca obrazek. */
function portraitMaker(lowQ: boolean) {
  let r: THREE.WebGLRenderer | null = null; let mats: Materials | null = null;
  const fn = ((c: Character) => {
    try {
      if (!r) { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(256, 300, false); r.outputColorSpace = THREE.SRGBColorSpace; mats = new Materials(lowQ); }
      const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(26, 256 / 300, .1, 20);
      scene.add(new THREE.HemisphereLight(0xffe6c8, 0x4b3a72, 1.7)); const k = new THREE.DirectionalLight(0xffd29a, 2.4); k.position.set(1.5, 2.5, 3); scene.add(k);
      const av = buildAvatar(new Builder(mats!), c.appearance); av.setHelmet(false); av.group.rotation.y = .35; scene.add(av.group); av.animate(0, 0);
      av.group.updateMatrixWorld(true); const hb = av.group.getObjectByName('head'); const p = new THREE.Vector3(0, 1.6, 0); hb?.getWorldPosition(p);
      cam.position.set(.3, p.y + .05, p.z + 1.6); cam.lookAt(0, p.y - .08, 0);
      r.render(scene, cam); const url = r.domElement.toDataURL('image/png'); av.dispose(); return url;
    } catch { return ''; }
  }) as ((c: Character) => string) & { dispose: () => void };
  fn.dispose = () => { mats?.dispose(); r?.dispose(); r?.forceContextLoss(); };
  return fn;
}
