import { MAX_CHARACTERS, type Backend, type Character, type AuthResult } from './backend';
import { normalizeAppearance, type Appearance } from '../data/appearance';

/**
 * Tryb lokalny – wszystko zapisywane w przeglądarce. Do testów i pracy bez serwera.
 * Włączany adresem z ?tryb=lokalny albo automatycznie, gdy brak konfiguracji Supabase.
 */
const KEY = 'ta-local-db-v1';
interface Db { users: { id: string; email: string; password: string }[]; session: string | null; characters: Record<string, Character>; /** postacie konta (kilka na konto) */ chars?: Record<string, Character[]> }

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
  /** Postacie zalogowanego konta (stary zapis z jedną postacią przenoszony automatycznie). */
  private mine(): Character[] | null {
    const d = db(); if (!d.session) return null; d.chars ??= {};
    if (!d.chars[d.session]) { const old = d.characters[d.session]; d.chars[d.session] = old ? [{ ...old, is_active: true }] : []; }
    return d.chars[d.session];
  }
  async listCharacters() { return (this.mine() ?? []).map(c => ({ ...c, appearance: normalizeAppearance(c.appearance) })); }
  async getCharacter() { const all = await this.listCharacters(); return all.find(c => c.is_active) ?? all[0] ?? null; }
  async setActiveCharacter(id: string) {
    const m = this.mine(); if (!m?.some(c => c.id === id)) return { ok: false, error: 'Nie ma takiej postaci.' };
    for (const c of m) c.is_active = c.id === id; save(); return { ok: true };
  }
  async createCharacter(name: string, appearance: Appearance) {
    const d = db(); const m = this.mine(); if (!m) return { ok: false as const, error: 'Zaloguj się ponownie.' };
    if (m.length >= MAX_CHARACTERS) return { ok: false as const, error: `Masz już ${MAX_CHARACTERS} postaci – to maksimum na jedno konto.` };
    const taken = Object.values(d.chars ?? {}).flat().some(c => c.name.toLowerCase() === name.toLowerCase());
    if (taken) return { ok: false as const, error: 'Ta nazwa postaci jest już zajęta. Wybierz inną.' };
    for (const c of m) c.is_active = false;
    const c: Character = { id: uid(), name, appearance, points: 0, shift_count: 0, last_position: null, is_active: true };
    m.push(c); save();
    return { ok: true as const, character: c };
  }
  async updateCharacter(patch: Partial<Pick<Character, 'appearance' | 'last_position'>>) {
    const c = this.mine()?.find(x => x.is_active); if (!c) return;
    Object.assign(c, patch); save();
  }
  async getBalance() { return []; }
  private viewsKey() { return 'tomi.lokalny.instrukcje.' + (db().session ?? ''); }
  async getInstructionViews() { try { return JSON.parse(localStorage.getItem(this.viewsKey()) ?? '{}') as Record<string, number>; } catch { return {}; } }
  async viewInstruction(modelId: string) { const v = await this.getInstructionViews(); v[modelId] = (v[modelId] ?? 0) + 1; try { localStorage.setItem(this.viewsKey(), JSON.stringify(v)); } catch { /* tryb prywatny */ } return v[modelId]; }
  async serverNow() { return Date.now(); }
  async addPoints(delta: number) {
    const c = this.mine()?.find(x => x.is_active); if (!c) throw new Error('Brak postaci');
    c.points = Math.max(0, c.points + Math.max(-1000, Math.min(1000, Math.round(delta)))); save(); return c.points;
  }
}
