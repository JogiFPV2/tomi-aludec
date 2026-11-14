/**
 * Sterowanie: klawiatura (komputer) i gałka + przyciski na ekranie (telefon).
 * Reszta gry pyta tylko o „oś ruchu” i „akcje” – nie wie, skąd przyszły.
 */
export type Action = 'use' | 'attach' | 'gear' | 'exit' | 'run' | 'control' | 'drop' | 'rotate' | 'sel1' | 'sel2' | 'sel3' | 'sel4';

export class Input {
  private keys = new Set<string>();
  private joy = { x: 0, y: 0, active: false };
  private held = new Set<string>(); // przyciski na ekranie trzymane palcem (np. hak góra/dół)
  private listeners: ((a: Action) => void)[] = [];
  private off: (() => void)[] = [];
  runToggle = false;

  constructor() {
    const kd = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === 'e' || k === 'enter') this.fire('use');
        if (k === ' ') this.fire('attach');
        if (k === 'q' || k === 'tab') this.fire('gear');
        if (k === 'escape') this.fire('exit');
        if (k === 'c') this.fire('control');
        if (k === 'g') this.fire('drop');
        if (k === 't') this.fire('rotate');
        if (k >= '1' && k <= '4') this.fire(('sel' + k) as Action);
      }
      this.keys.add(k);
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
    const blur = () => this.reset();
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur);
    this.off.push(() => removeEventListener('keydown', kd), () => removeEventListener('keyup', ku), () => removeEventListener('blur', blur));
  }

  /** Puszcza wszystkie klawisze i gałkę (np. po zamknięciu innego ekranu). */
  reset() { this.keys.clear(); this.held.clear(); this.joy.x = this.joy.y = 0; }

  onAction(fn: (a: Action) => void) { this.listeners.push(fn); }
  fire(a: Action) { for (const fn of this.listeners) fn(a); }
  private k(name: string) { return this.keys.has(name) || this.held.has(name) ? 1 : 0; }

  /** Kierunek ruchu: x w prawo, z „w dół ekranu”. Długość 0..1. */
  move(): { x: number; z: number } {
    let x = this.k('d') + this.k('arrowright') - this.k('a') - this.k('arrowleft');
    let z = this.k('s') + this.k('arrowdown') - this.k('w') - this.k('arrowup');
    if (this.joy.active) { x = this.joy.x; z = this.joy.y; }
    const l = Math.hypot(x, z); if (l > 1) { x /= l; z /= l; }
    return { x, z };
  }
  hoist(): number { return this.k('r') + this.k('pageup') + this.k('hoist-up') - this.k('f') - this.k('pagedown') - this.k('hoist-down'); }
  /** skracanie (+1) / luzowanie (−1) wybranego łańcucha */
  chain(): -1 | 0 | 1 { const v = this.k('x') + this.k('chain-up') - this.k('z') - this.k('chain-down'); return v > 0 ? 1 : v < 0 ? -1 : 0; }
  running(): boolean { return this.keys.has('shift') || this.runToggle; }

  setJoystick(x: number, y: number, active: boolean) { this.joy.x = x; this.joy.y = y; this.joy.active = active; }
  hold(name: string, on: boolean) { if (on) this.held.add(name); else this.held.delete(name); }

  dispose() { this.off.forEach(f => f()); this.listeners = []; }
}
