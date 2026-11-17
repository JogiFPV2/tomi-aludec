import { PaintController } from './ui/screens/paint';
import { GameClock } from './core/clock';
import { InstructionService } from './ui/instruction';
import { MetalsController } from './ui/screens/metals';
import './styles.css';
import { EventBus } from './core/events';
import { mergeBalance, DEFAULT_BALANCE, type Balance } from './core/balance';
import type { Backend, Character } from './services/backend';
import { SupabaseBackend } from './services/supabaseBackend';
import { LocalBackend } from './services/localBackend';
import { authScreen } from './ui/screens/auth';
import { creatorScreen } from './ui/screens/creator';
import { mainMenuScreen } from './ui/screens/mainMenu';
import { enableMultitouch } from './ui/multitouch';
import { HallAudio } from './game/audio/hall';
import { settings } from './core/settings';
import { Game } from './game/Game';
import { Hud } from './ui/hud';
import { h } from './ui/dom';
import { PourController } from './ui/screens/pour';
import { Scoring } from './game/score/scoring';
import { loadHumanAsset } from './game/character/worker';

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
document.body.classList.toggle('touch', isTouch);
if (isTouch) enableMultitouch();
if (params.has('zrzut')) (window as unknown as { __HallAudio: typeof HallAudio }).__HallAudio = HallAudio;
const lowQ = isTouch || Math.min(innerWidth, innerHeight) < 560 || params.get('jakosc') === 'niska';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
const backend: Backend = params.get('tryb') === 'lokalny' || !URL_ || !KEY ? new LocalBackend() : new SupabaseBackend(URL_, KEY);

const app = document.getElementById('app')!;
let cleanup: (() => void) | null = null;
const swap = (fn: () => () => void) => { cleanup?.(); cleanup = fn(); };

function loading(text: string) { swap(() => { const el = h('div', { class: 'screen loading' }, h('div', { class: 'spinner' }), h('p', { text })); app.append(el); return () => el.remove(); }); }
function fatal(text: string) { swap(() => { const el = h('div', { class: 'screen loading' }, h('p', { text }), h('button', { class: 'btn pri', type: 'button', text: 'Spróbuj ponownie', onclick: () => location.reload() })); app.append(el); return () => el.remove(); }); }

async function start() {
  loading('Łączenie z serwerem gry…');
  try {
    const user = await backend.currentUser();
    if (!user) return showAuth();
    await afterLogin();
  } catch (e) { console.error(e); fatal('Nie udało się połączyć z serwerem gry. Sprawdź internet i spróbuj ponownie.'); }
}

function showAuth() { swap(() => authScreen(app, backend, () => { afterLogin().catch(err => { console.error(err); fatal('Coś poszło nie tak po zalogowaniu. Spróbuj ponownie.'); }); })); }

let assetReady: Promise<unknown> | null = null;
async function afterLogin() {
  loading('Wczytywanie…');
  assetReady ??= loadHumanAsset().catch(e => { console.warn('[postać] brak zasobu postaci – prosty model', e); return null; });
  await assetReady;
  showMainMenu();
}

/** Menu główne: hala, postacie, kreator, ustawienia. */
async function showMainMenu() {
  const user = await backend.currentUser();
  if (!user) return showAuth();
  swap(() => mainMenuScreen(app, { backend, email: user.email, lowQ, touch: isTouch,
    onPlay: c => { enterGame(c).catch(err => { console.error(err); fatal('Nie udało się wejść na halę. Spróbuj ponownie.'); }); },
    onCreate: () => swap(() => creatorScreen(app, backend, lowQ, () => showMainMenu(), () => showMainMenu())),
    onLogout: async () => { await backend.signOut(); showAuth(); } }));
}

async function enterGame(character: Character) {
  loading('Wchodzisz na halę…');
  let balance: Balance = DEFAULT_BALANCE;
  try { balance = mergeBalance(await backend.getBalance()); } catch { /* zostaje domyślny */ }
  swap(() => {
    const wrap = h('div', { class: 'screen game' }); app.append(wrap);
    const bus = new EventBus();
    let game: Game;
    try { game = new Game({ container: wrap, backend, character, balance, bus, lowQuality: lowQ }); }
    catch (e) { console.error(e); wrap.append(h('p', { class: 'center-msg', text: 'Ta przeglądarka nie obsługuje grafiki 3D (WebGL). Spróbuj w Chrome, Safari albo Firefox.' })); return () => wrap.remove(); }
    const clock = new GameClock(); backend.serverNow().then(ms => clock.sync(ms)).catch(() => { /* zegar urządzenia */ });
    const hud = new Hud(wrap, game, bus, character, { clock, dev: balance.devUnlockAll, onLogout: async () => { game.savePosition(); await backend.signOut(); showAuth(); }, onMainMenu: () => { game.savePosition(); showMainMenu(); } });
    const instr = new InstructionService(wrap, backend, bus, balance);
    const pour = new PourController(wrap, bus, balance, lowQ, game, instr);
    const metals = new MetalsController(wrap, game, bus, balance, instr);
    const paint = new PaintController(wrap, game, bus, balance);
    const scoring = new Scoring(bus, backend, character);
    // dźwięk hali: przeglądarka pozwala go włączyć dopiero po pierwszym dotknięciu / klawiszu
    let audio: HallAudio | null = null; let audioTimer = 0;
    try {
      audio = new HallAudio({ callUrl: `${import.meta.env.BASE_URL}assets/audio/wolanie-e.mp3`, volume: settings.v.volume, ambience: settings.v.ambience,
        listener: () => game.playerPos(),
        craneSpeed: () => { const c = game.remote; return c ? { x: c.state.x, z: c.state.z, speed: Math.hypot(c.state.vx, c.state.vz) } : null; },
        fires: () => game.yard.loads.filter(l => l.paint?.state === 'burning').map(l => ({ x: l.x, z: l.z })) });
      audio.start(); audioTimer = window.setInterval(() => audio?.update(), 100);
    } catch (e) { console.warn('[dźwięk] niedostępny', e); }
    const wake = () => audio?.resume();
    const vis = () => { if (document.hidden) audio?.suspend(); else audio?.resume(); };
    addEventListener('pointerdown', wake); addEventListener('keydown', wake); document.addEventListener('visibilitychange', vis);
    const offVol = settings.watch(s => audio?.setVolume(s.volume, s.ambience));
    const stopAudio = () => { offVol(); clearInterval(audioTimer); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); document.removeEventListener('visibilitychange', vis); audio?.dispose(); audio = null; };
    (window as unknown as { __game: Game }).__game = game;
    return () => { stopAudio(); paint.dispose(); instr.dispose(); metals.dispose(); pour.dispose(); scoring.dispose(); hud.dispose(); game.dispose(); bus.clear(); wrap.remove(); };
  });
}

start();
