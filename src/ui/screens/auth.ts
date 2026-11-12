import { h } from '../dom';
import type { Backend, SessionUser } from '../../services/backend';

/** Ekran logowania i rejestracji. */
export function authScreen(root: HTMLElement, backend: Backend, onDone: (u: SessionUser) => void): () => void {
  let mode: 'login' | 'register' = 'login';
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const email = h('input', { id: 'auth-email', type: 'email', autocomplete: 'email', required: true, placeholder: 'np. jan@poczta.pl' });
  const pass = h('input', { id: 'auth-pass', type: 'password', autocomplete: 'current-password', required: true, minlength: 8 });
  const pass2 = h('input', { id: 'auth-pass2', type: 'password', autocomplete: 'new-password', minlength: 8 });
  const pass2Row = h('label', { class: 'field', hidden: true }, h('span', { text: 'Powtórz hasło' }), pass2);
  const submit = h('button', { class: 'btn pri wide', type: 'submit', text: 'Zaloguj się' });
  const tabL = h('button', { class: 'tab on', type: 'button', text: 'Logowanie', onclick: () => setMode('login') });
  const tabR = h('button', { class: 'tab', type: 'button', text: 'Rejestracja', onclick: () => setMode('register') });
  const forgot = h('button', { class: 'link', type: 'button', text: 'Nie pamiętasz hasła?', onclick: async () => {
    if (!email.value) { show('Wpisz najpierw swój adres e-mail.', 'bad'); email.focus(); return; }
    const r = await backend.resetPassword(email.value.trim()); show(r.ok ? 'Wysłaliśmy e-mail z linkiem do zmiany hasła.' : r.error ?? 'Nie udało się wysłać e-maila.', r.ok ? 'ok' : 'bad');
  } });

  function setMode(m: typeof mode) {
    mode = m; tabL.classList.toggle('on', m === 'login'); tabR.classList.toggle('on', m === 'register');
    pass2Row.hidden = m === 'login'; pass2.required = m === 'register'; submit.textContent = m === 'login' ? 'Zaloguj się' : 'Załóż konto';
    pass.autocomplete = m === 'login' ? 'current-password' : 'new-password'; forgot.hidden = m === 'register' || backend.kind === 'local'; show('');
  }
  function show(t: string, kind: 'ok' | 'bad' | '' = '') { msg.textContent = t; msg.className = 'form-msg ' + kind; }

  const form = h('form', { class: 'auth-form', novalidate: true },
    h('div', { class: 'tabs' }, tabL, tabR),
    h('label', { class: 'field' }, h('span', { text: 'E-mail' }), email),
    h('label', { class: 'field' }, h('span', { text: 'Hasło (min. 8 znaków)' }), pass),
    pass2Row, msg, submit, forgot,
  );
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const em = email.value.trim(), pw = pass.value;
    if (!/^\S+@\S+\.\S+$/.test(em)) { show('Wpisz poprawny adres e-mail.', 'bad'); email.focus(); return; }
    if (pw.length < 8) { show('Hasło musi mieć co najmniej 8 znaków.', 'bad'); pass.focus(); return; }
    if (mode === 'register' && pw !== pass2.value) { show('Hasła nie są takie same.', 'bad'); pass2.focus(); return; }
    submit.disabled = true; show(mode === 'login' ? 'Loguję…' : 'Zakładam konto…');
    try {
      const r = mode === 'login' ? await backend.signIn(em, pw) : await backend.signUp(em, pw);
      if (r.ok) { onDone(r.user); return; }
      show(r.error, r.needsConfirm ? 'ok' : 'bad'); if (r.needsConfirm) setTimeout(() => setMode('login'), 50);
    } catch (err) { show('Brak połączenia z serwerem gry. Sprawdź internet i spróbuj ponownie.', 'bad'); console.error(err); }
    finally { submit.disabled = false; }
  });

  const screen = h('div', { class: 'screen auth' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'eyebrow', text: 'Symulator formierni' }),
      h('h1', { class: 'logo' }, 'Tomi ', h('b', { text: 'Aludec' })),
      h('p', { class: 'dim', text: 'Załóż konto, stwórz swoją postać i zacznij zmianę na formierni.' }),
      form,
      backend.kind === 'local' ? h('p', { class: 'note', text: 'Tryb lokalny (testowy): konto i postać zapisują się tylko w tej przeglądarce.' }) : null,
    ));
  root.append(screen); setMode('login'); email.focus();
  return () => screen.remove();
}
