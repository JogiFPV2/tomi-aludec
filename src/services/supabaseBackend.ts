import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend, Character, AuthResult } from './backend';
import { plError } from './backend';
import { normalizeAppearance, type Appearance } from '../data/appearance';

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;

  constructor(url: string, key: string) {
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  async currentUser() {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    const redirect = location.origin + location.pathname;
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
    if (error) return { ok: false, error: plError(error.message) };
    if (!data.session) return { ok: false, needsConfirm: true, error: 'Wysłaliśmy e-mail z linkiem potwierdzającym. Kliknij go, a potem zaloguj się.' };
    return { ok: true, user: { id: data.user!.id, email: data.user!.email ?? email } };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: plError(error.message) };
    return { ok: true, user: { id: data.user.id, email: data.user.email ?? email } };
  }

  async signOut() { await this.sb.auth.signOut(); }

  async resetPassword(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    return error ? { ok: false, error: plError(error.message) } : { ok: true };
  }

  async listCharacters(): Promise<Character[]> {
    const { data, error } = await this.sb.from('characters').select('id,name,appearance,points,shift_count,last_position,is_active').order('created_at');
    if (error) throw new Error(plError(error.message));
    return (data ?? []).map(d => ({ ...d, appearance: normalizeAppearance(d.appearance) }) as Character);
  }
  async getCharacter(): Promise<Character | null> {
    const all = await this.listCharacters();
    return all.find(c => c.is_active) ?? all[0] ?? null;
  }
  async setActiveCharacter(id: string) {
    const { error } = await this.sb.rpc('set_active_character', { p_id: id });
    return error ? { ok: false, error: plError(error.message) } : { ok: true };
  }

  async createCharacter(name: string, appearance: Appearance) {
    const user = await this.currentUser();
    if (!user) return { ok: false as const, error: 'Sesja wygasła. Zaloguj się ponownie.' };
    const { data, error } = await this.sb.from('characters').insert({ user_id: user.id, name, appearance })
      .select('id,name,appearance,points,shift_count,last_position,is_active').single();
    if (error) return { ok: false as const, error: error.code === '23505' ? 'Ta nazwa postaci jest już zajęta. Wybierz inną.' : plError(error.message) };
    // nowa postać od razu staje się aktywna
    const act = await this.setActiveCharacter(data.id);
    return { ok: true as const, character: { ...data, is_active: act.ok, appearance: normalizeAppearance(data.appearance) } as Character };
  }

  async updateCharacter(patch: Partial<Pick<Character, 'appearance' | 'last_position'>>) {
    const user = await this.currentUser();
    if (!user) return;
    const { error } = await this.sb.from('characters').update(patch).eq('user_id', user.id).eq('is_active', true);
    if (error) console.warn('[backend] zapis postaci nie powiódł się', error.message);
  }

  async addPoints(delta: number, reason: string) {
    const { data, error } = await this.sb.rpc('add_points', { p_delta: Math.round(delta), p_reason: reason });
    if (error) throw new Error(plError(error.message));
    return data as number;
  }

  async getInstructionViews() {
    const { data, error } = await this.sb.from('instruction_views').select('model_id,views');
    if (error) { console.warn('[backend] nie udało się pobrać licznika instrukcji', error.message); return {}; }
    return Object.fromEntries((data ?? []).map(r => [r.model_id as string, r.views as number]));
  }
  async viewInstruction(modelId: string) {
    const { data, error } = await this.sb.rpc('view_instruction', { p_model: modelId });
    if (error) throw new Error(plError(error.message));
    return data as number;
  }
  async serverNow() {
    const { data, error } = await this.sb.rpc('server_now');
    if (error || !data) return Date.now();
    return new Date(data as string).getTime();
  }

  async getBalance() {
    const { data, error } = await this.sb.from('balance').select('key,value');
    if (error) { console.warn('[backend] nie udało się pobrać balansu – używam domyślnego', error.message); return []; }
    return data ?? [];
  }
}
