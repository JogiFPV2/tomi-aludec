import type { Backend, Character, AuthResult } from './backend';
import { normalizeAppearance, type Appearance } from '../data/appearance';

/**
 * Tryb lokalny – wszystko zapisywane w przeglądarce. Do testów i pracy bez serwera.
 * Włączany adresem z ?tryb=lokalny albo automatycznie, gdy brak konfiguracji Supabase.
 */
const KEY = 'ta-local-db-v1';
interface Db { users: { id: string; email: string; password: string }[]; session: string | null; characters: Record<string, Character> }

function load(): Db {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as Db; } catch { /* brak dostępu do pamięci */ }
  return { users: [], session: null, characters: {} };
}
let memory: Db | null = null;
function db(): Db { memory ??= load(); return memory; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(db())); } catch { /* tryb prywatny – zostaje w pamięci */ } }
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export class LocalBackend implements Backend {
  readonly kind = 'local' as const;

  async currentUser() {
    const d = db(); const u = d.users.find(x => x.id === d.session);
    return u ? { id: u.id, email: u.email } : null;
  }
  async signUp(email: string, password: string): Promise<AuthResult> {
    const d = db();
    if (d.users.some(u => u.email === email)) return { ok: false, error: 'Konto z tym adresem e-mail już istnieje. Zaloguj się.' };
    const u = { id: uid(), email, password };
    d.users.push(u); d.session = u.id; save();
    return { ok: true, user: { id: u.id, email } };
  }
  async signIn(email: string, password: string): Promise<AuthResult> {
    const d = db(); const u = d.users.find(x => x.email === email && x.password === password);
    if (!u) return { ok: false, error: 'Nieprawidłowy e-mail albo hasło.' };
    d.session = u.id; save();
    return { ok: true, user: { id: u.id, email } };
  }
  async signOut() { db().session = null; save(); }
  async resetPassword() { return { ok: true }; }
  async getCharacter() {
    const d = db(); const c = d.session ? d.characters[d.session] : undefined;
    return c ? { ...c, appearance: normalizeAppearance(c.appearance) } : null;
  }
  async createCharacter(name: string, appearance: Appearance) {
    const d = db(); if (!d.session) return { ok: false as const, error: 'Zaloguj się ponownie.' };
    if (Object.values(d.characters).some(c => c.name.toLowerCase() === name.toLowerCase())) return { ok: false as const, error: 'Ta nazwa postaci jest już zajęta. Wybierz inną.' };
    const c: Character = { id: uid(), name, appearance, points: 0, shift_count: 0, last_position: null };
    d.characters[d.session] = c; save();
    return { ok: true as const, character: c };
  }
  async updateCharacter(patch: Partial<Pick<Character, 'appearance' | 'last_position'>>) {
    const d = db(); if (!d.session || !d.characters[d.session]) return;
    Object.assign(d.characters[d.session], patch); save();
  }
  async getBalance() { return []; }
  async addPoints(delta: number) {
    const d = db(); const c = d.session ? d.characters[d.session] : undefined; if (!c) throw new Error('Brak postaci');
    c.points = Math.max(0, c.points + Math.max(-1000, Math.min(1000, Math.round(delta)))); save(); return c.points;
  }
}
