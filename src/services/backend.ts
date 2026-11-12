import type { Appearance } from '../data/appearance';

/**
 * Jedno wspólne „okno” na serwer. Reszta gry zna tylko ten interfejs –
 * nie wie, czy pod spodem jest Supabase, czy tryb lokalny (testy, praca bez internetu).
 */
export interface Character {
  id: string;
  name: string;
  appearance: Appearance;
  points: number;
  shift_count: number;
  last_position: { x: number; z: number; room?: string } | null;
}

export interface SessionUser { id: string; email: string }

export type AuthResult = { ok: true; user: SessionUser } | { ok: false; error: string; needsConfirm?: boolean };

export interface Backend {
  readonly kind: 'supabase' | 'local';
  currentUser(): Promise<SessionUser | null>;
  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<{ ok: boolean; error?: string }>;
  getCharacter(): Promise<Character | null>;
  createCharacter(name: string, appearance: Appearance): Promise<{ ok: true; character: Character } | { ok: false; error: string }>;
  updateCharacter(patch: Partial<Pick<Character, 'appearance' | 'last_position'>>): Promise<void>;
  getBalance(): Promise<{ key: string; value: unknown }[]>;
}

/** Tłumaczy typowe komunikaty serwera na zrozumiałe zdania po polsku. */
export function plError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Nieprawidłowy e-mail albo hasło.';
  if (m.includes('email not confirmed')) return 'Konto nie jest jeszcze potwierdzone. Kliknij link w e-mailu, który do Ciebie wysłaliśmy.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Konto z tym adresem e-mail już istnieje. Zaloguj się.';
  if (m.includes('password should be at least') || m.includes('weak')) return 'Hasło jest za słabe. Użyj co najmniej 8 znaków.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Ten adres e-mail wygląda na nieprawidłowy.';
  if (m.includes('rate limit')) return 'Za dużo prób w krótkim czasie. Spróbuj ponownie za kilka minut.';
  if (m.includes('duplicate') && m.includes('name')) return 'Ta nazwa postaci jest już zajęta. Wybierz inną.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Brak połączenia z serwerem gry. Sprawdź internet i spróbuj ponownie.';
  return msg;
}
