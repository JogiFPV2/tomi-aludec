import type { EventBus } from '../../core/events';
import type { Backend, Character } from '../../services/backend';

/**
 * Moduł punktacji: nasłuchuje wyników pracy i zapisuje punkty na serwerze.
 * Inne moduły nic nie wiedzą o punktach – tylko ogłaszają zdarzenia.
 */
export class Scoring {
  private off: (() => void)[] = [];
  constructor(bus: EventBus, backend: Backend, character: Character) {
    this.off.push(bus.on('pour:finished', async r => {
      try {
        const pts = await backend.addPoints(r.points, `Sypanie ${r.modelId}: ${r.points} pkt`);
        character.points = pts;
        bus.emit('points:changed', { points: pts, delta: r.points, reason: 'sypanie' });
      } catch (e) {
        console.error(e);
        bus.emit('toast', { text: 'Nie udało się zapisać punktów na serwerze. Sprawdź połączenie.', kind: 'bad' });
      }
    }));
    // punkty z innych czynności (wyciąganie formy, odkładanie na paletę, kary)
    this.off.push(bus.on('score:add', async r => {
      try {
        const pts = await backend.addPoints(r.delta, r.reason);
        character.points = pts;
        bus.emit('points:changed', { points: pts, delta: r.delta, reason: r.reason });
      } catch (e) { console.error(e); bus.emit('toast', { text: 'Nie udało się zapisać punktów na serwerze.', kind: 'bad' }); }
    }));
  }
  dispose() { this.off.forEach(f => f()); }
}
