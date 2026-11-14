/**
 * Szyna zdarzeń – moduły gry nie wołają się nawzajem bezpośrednio.
 * Moduł ogłasza zdarzenie (emit), a inne moduły, które są nim zainteresowane, nasłuchują (on).
 * Dzięki temu zmiana w jednym module (np. suwnica) nie wymaga zmian w innym (np. punktacja).
 */
export interface GameEvents {
  'player:moved': { x: number; z: number };
  'interact:available': { id: string; label: string } | null;
  'crane:enter': { gear: CraneGear };
  'crane:exit': void;
  'crane:gear': { gear: CraneGear };
  'crane:attached': { loadId: string };
  'crane:detached': { loadId: string; onTarget: boolean };
  'crane:swing': { amplitude: number };
  'crane:locked': { needPoints: number; havePoints: number };
  'toast': { text: string; kind?: 'ok' | 'bad' | 'info' };
  'pour:open': { stationId: string; loadId: string; modelId: string };
  'pour:closed': { stationId: string };
  'pour:finished': { stationId: string; loadId: string; modelId: string; points: number; breakdown: { label: string; pts: number }[]; hooks: { x: number; z: number; ok?: boolean }[] };
  'score:add': { delta: number; reason: string };
  'crane:choice': { options: string[] } | null;
  'remote:changed': { stationId: string; color: string; name: string } | null;
  'points:changed': { points: number; delta: number; reason?: string };
  'game:pause': { paused: boolean };
  /** co gracz trzyma: paleciak albo palety w rękach */
  'transport:changed': { holding: 'jack' | 'hand'; label: string } | null;
}
export type CraneGear = 1 | 2;

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(name: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) { set = new Set(); this.handlers.set(name, set); }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try { (fn as Handler<E[K]>)(payload); }
      catch (err) { console.error(`[events] błąd w obsłudze „${String(name)}”`, err); }
    }
  }

  clear(): void { this.handlers.clear(); }
}
