/**
 * Zegar gry: data i godzina wspólne dla wszystkich graczy (czas serwera, strefa Europe/Warsaw)
 * oraz zmiana robocza: I 6–14, II 14–22, III 22–6.
 */
export type Shift = 'I' | 'II' | 'III';
export const shiftOf = (hour: number): Shift => hour >= 6 && hour < 14 ? 'I' : hour >= 14 && hour < 22 ? 'II' : 'III';

const TZ = 'Europe/Warsaw';
const fmt = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Rozkłada chwilę (ms) na napisy do interfejsu. */
export function clockParts(ms: number): { date: string; time: string; shift: Shift } {
  const p: Record<string, string> = {}; for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.weekday} ${p.day}.${p.month}.${p.year}`, time: `${p.hour}:${p.minute}`, shift: shiftOf(Number(p.hour)) };
}

/** Zegar zsynchronizowany z serwerem: pamięta różnicę między czasem serwera a zegarem urządzenia. */
export class GameClock {
  private offset = 0;
  sync(serverMs: number) { if (isFinite(serverMs)) this.offset = serverMs - Date.now(); }
  now() { return Date.now() + this.offset; }
}
