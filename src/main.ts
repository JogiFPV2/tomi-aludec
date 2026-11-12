import './styles.css';
import { EventBus } from './core/events';
import { mergeBalance, DEFAULT_BALANCE, type Balance } from './core/balance';
import type { Backend, Character } from './services/backend';
import { SupabaseBackend } from './services/supabaseBackend';
import { LocalBackend } from './services/localBackend';
import { authScreen } from './ui/screens/auth';
import { creatorScreen } from './ui/screens/creator';
import { Game } from './game/Game';
import { Hud } from './ui/hud';
import { h } from './ui/dom';
import { PourController } from './ui/screens/pour';
import { Scoring } from './game/score/scoring';
import { loadHumanAsset } from './game/character/worker';

const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
document.body.classList.toggle('touch', isTouch);
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

async function afterLogin() {
  loading('Wczytywanie postaci…');
  const [character] = await Promise.all([backend.getCharacter(), loadHumanAsset().catch(e => { console.warn('[postać] brak zasobu postaci – prosty model', e); return null; })]);
  if (!character) { swap(() => creatorScreen(app, backend, lowQ, c => enterGame(c))); return; }
  await enterGame(character);
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
    const hud = new Hud(wrap, game, bus, character, { dev: balance.devUnlockAll, onLogout: async () => { game.savePosition(); await backend.signOut(); showAuth(); } });
    const pour = new PourController(wrap, bus, balance, lowQ);
    const scoring = new Scoring(bus, backend, character);
    (window as unknown as { __game: Game }).__game = game;
    return () => { pour.dispose(); scoring.dispose(); hud.dispose(); game.dispose(); bus.clear(); wrap.remove(); };
  });
}

start();
