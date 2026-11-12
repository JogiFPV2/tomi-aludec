import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { h } from '../dom';
import { Materials } from '../../game/render/materials';
import { Builder } from '../../game/render/build';
import { buildAvatar, type Avatar } from '../../game/character/avatar';
import {
  DEFAULT_APPEARANCE, randomAppearance, SKIN_COLORS, HAIR_COLORS, EYE_COLORS, HELMET_COLORS, HAIR_STYLES, BEARD_STYLES, type Appearance,
} from '../../data/appearance';
import type { Backend, Character } from '../../services/backend';

/** Kreator postaci z podglądem 3D. */
export function creatorScreen(root: HTMLElement, backend: Backend, lowQ: boolean, onDone: (c: Character) => void): () => void {
  let a: Appearance = { ...DEFAULT_APPEARANCE };
  // podgląd 3D
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const outline = new OutlineEffect(renderer, { defaultThickness: .004, defaultColor: [.09, .07, .05] });
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
  scene.add(new THREE.HemisphereLight(0xdde6f0, 0x5a4a3c, 1.4)); const key = new THREE.DirectionalLight(0xfff0dc, 2.2); key.position.set(2, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(-2, 2, -2); scene.add(rim);
  const mats = new Materials(lowQ); const b = new Builder(mats);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.7, .75, .06, 40), mats.get('dark')); disc.position.y = -.03; scene.add(disc);
  let avatar: Avatar | null = null; let helmetOn = false; let view: 'cialo' | 'twarz' = 'cialo'; let rotY = .4, drag: number | null = null;
  const rebuild = () => { if (avatar) { scene.remove(avatar.group); avatar.dispose(); } avatar = buildAvatar(b, a); avatar.setHelmet(helmetOn); scene.add(avatar.group); };

  const canvasWrap = h('div', { class: 'preview' }, renderer.domElement);
  renderer.domElement.addEventListener('pointerdown', e => { drag = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => { if (drag !== null) { rotY += (e.clientX - drag) * .01; drag = e.clientX; } });
  renderer.domElement.addEventListener('pointerup', () => drag = null);

  // kontrolki
  const panels: Record<string, HTMLElement> = {};
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) => { a = { ...a, [k]: v }; rebuild(); };
  const slider = (label: string, k: 'height' | 'build' | 'shoulders' | 'eyeSize' | 'eyeSpacing' | 'noseSize' | 'noseLength' | 'earSize' | 'mouthWidth', min = 0, max = 1, step = .01, fmt = (v: number) => Math.round(v * 100).toString()) => {
    const id = 'sl-' + k; const out = h('span', { class: 'num dim', text: fmt(a[k]) });
    const inp = h('input', { id, type: 'range', min, max, step, value: a[k] });
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); out.textContent = fmt(v); set(k, v); });
    return h('label', { class: 'slider', for: id }, h('span', { class: 'row' }, h('span', { text: label }), out), inp);
  };
  const swatches = (label: string, k: 'skin' | 'hairColor' | 'eyeColor' | 'helmetColor', colors: string[]) => {
    const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': label });
    for (const c of colors) { const btn = h('button', { type: 'button', class: 'sw' + (a[k] === c ? ' on' : ''), style: `--c:${c}`, 'aria-label': `${label} ${c}`, onclick: () => { wrap.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); btn.classList.add('on'); set(k, c); } }); wrap.append(btn); }
    return h('div', { class: 'ctl' }, h('span', { text: label }), wrap);
  };
  const chips = <K extends 'hairStyle' | 'beard' | 'glasses' | 'body'>(label: string, k: K, opts: { id: Appearance[K]; label: string }[]) => {
    const wrap = h('div', { class: 'chips' });
    for (const o of opts) { const btn = h('button', { type: 'button', class: 'chip' + (a[k] === o.id ? ' on' : ''), text: o.label, onclick: () => { wrap.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); btn.classList.add('on'); set(k, o.id); } }); wrap.append(btn); }
    return h('div', { class: 'ctl' }, h('span', { text: label }), wrap);
  };
  const build = () => {
    panels.cialo = h('div', { class: 'tabpanel' },
      chips('Sylwetka', 'body', [{ id: 'm', label: 'Męska' }, { id: 'k', label: 'Żeńska' }]),
      slider('Wzrost', 'height', 150, 205, 1, v => `${Math.round(v)} cm`), slider('Budowa ciała', 'build'), slider('Szerokość barków', 'shoulders'),
      swatches('Kolor skóry', 'skin', SKIN_COLORS));
    panels.twarz = h('div', { class: 'tabpanel', hidden: true },
      slider('Wielkość oczu', 'eyeSize'), slider('Rozstaw oczu', 'eyeSpacing'), swatches('Kolor oczu', 'eyeColor', EYE_COLORS),
      slider('Wielkość nosa', 'noseSize'), slider('Długość nosa', 'noseLength'), slider('Wielkość uszu', 'earSize'), slider('Szerokość ust', 'mouthWidth'));
    panels.wlosy = h('div', { class: 'tabpanel', hidden: true },
      chips('Fryzura', 'hairStyle', HAIR_STYLES), swatches('Kolor włosów', 'hairColor', HAIR_COLORS), chips('Zarost', 'beard', BEARD_STYLES));
    panels.dodatki = h('div', { class: 'tabpanel', hidden: true },
      chips('Okulary', 'glasses', [{ id: 'none', label: 'Brak' }, { id: 'korekcyjne', label: 'Korekcyjne' }, { id: 'ochronne', label: 'Ochronne' }]),
      swatches('Kolor kasku', 'helmetColor', HELMET_COLORS));
  };
  build();
  const tabsDef: [string, string, 'cialo' | 'twarz'][] = [['cialo', 'Ciało', 'cialo'], ['twarz', 'Twarz', 'twarz'], ['wlosy', 'Włosy i zarost', 'twarz'], ['dodatki', 'Dodatki', 'cialo']];
  const tabs = h('div', { class: 'tabs vertical', role: 'tablist' });
  const showTab = (id: string) => { for (const [tid, , v] of tabsDef) { panels[tid].hidden = tid !== id; if (tid === id) view = v; } tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', (t as HTMLElement).dataset.id === id)); };
  for (const [id, label] of tabsDef) tabs.append(h('button', { class: 'tab' + (id === 'cialo' ? ' on' : ''), type: 'button', 'data-id': id, text: label, onclick: () => showTab(id) }));
  const panelBox = h('div', { class: 'panels' }, ...Object.values(panels));

  const name = h('input', { id: 'char-name', type: 'text', maxlength: 24, placeholder: 'np. Jan Kowalczyk', autocomplete: 'off' });
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const helmetBtn = h('button', { class: 'btn small', type: 'button', text: 'Załóż kask', onclick: () => { helmetOn = !helmetOn; helmetBtn.textContent = helmetOn ? 'Zdejmij kask' : 'Załóż kask'; avatar?.setHelmet(helmetOn); } });
  const randomBtn = h('button', { class: 'btn', type: 'button', text: 'Losuj wygląd', onclick: () => { const keepBody = a.body; a = randomAppearance(); void keepBody; panelBox.innerHTML = ''; build(); panelBox.append(...Object.values(panels)); showTab(tabs.querySelector('.tab.on')?.getAttribute('data-id') ?? 'cialo'); rebuild(); } });
  const saveBtn = h('button', { class: 'btn pri', type: 'button', text: 'Zapisz postać i wejdź na zmianę', onclick: async () => {
    const n = name.value.trim().replace(/\s+/g, ' ');
    if (n.length < 2) { msg.textContent = 'Wpisz imię postaci (co najmniej 2 znaki).'; msg.className = 'form-msg bad'; name.focus(); return; }
    saveBtn.disabled = true; msg.textContent = 'Zapisuję postać…'; msg.className = 'form-msg';
    const r = await backend.createCharacter(n, a).catch(() => ({ ok: false as const, error: 'Brak połączenia z serwerem gry. Spróbuj ponownie.' }));
    saveBtn.disabled = false;
    if (!r.ok) { msg.textContent = r.error; msg.className = 'form-msg bad'; return; }
    onDone(r.character);
  } });

  const screen = h('div', { class: 'screen creator' },
    h('header', { class: 'creator-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Krok 1 z 1' }), h('h1', { class: 'title', text: 'Kreator postaci' })),
      h('label', { class: 'field name' }, h('span', { text: 'Imię i nazwisko postaci' }), name)),
    h('div', { class: 'creator-body' }, h('nav', { class: 'creator-nav' }, tabs), panelBox, canvasWrap),
    h('footer', { class: 'creator-foot' }, helmetBtn, randomBtn, h('div', { class: 'grow' }, msg), saveBtn));
  root.append(screen);
  rebuild();

  let raf = 0; let camY = 1.1, camD = 4.2;
  // wysokość twarzy: z kości głowy realistycznej postaci, a dla prostego modelu z wzrostu
  const hp = new THREE.Vector3();
  const faceY = () => { const hb = avatar?.group.getObjectByName('head'); if (!hb) return 1.66 * a.height / 180; avatar!.group.updateMatrixWorld(true); hb.getWorldPosition(hp); return hp.y + .07 * a.height / 180; };
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const w = canvasWrap.clientWidth, hh = canvasWrap.clientHeight; if (w && hh && (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(hh * renderer.getPixelRatio()))) { renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix(); }
    const k = a.height / 180; const ty = view === 'twarz' ? faceY() : .95 * k, td = view === 'twarz' ? 1.1 : 4.4;
    camY += (ty - camY) * .12; camD += (td - camD) * .12;
    cam.position.set(Math.sin(.15) * camD, camY + (view === 'twarz' ? .03 : .15), Math.cos(.15) * camD); cam.lookAt(0, camY, 0);
    if (avatar) { avatar.group.rotation.y = rotY; avatar.animate(1 / 60, 0); }
    if (drag === null && !matchMedia('(prefers-reduced-motion: reduce)').matches) rotY += .003;
    outline.render(scene, cam);
    (window as unknown as { __frames: number }).__frames = ((window as unknown as { __frames: number }).__frames || 0) + 1;
  };
  loop();
  name.focus();
  return () => { cancelAnimationFrame(raf); avatar?.dispose(); mats.dispose(); renderer.dispose(); screen.remove(); };
}
