/**
 * Egypt-local calendar helpers.
 *
 * The server's own timezone is whatever the host runs in — usually UTC in production —
 * so `setHours(0, 0, 0, 0)` and `getHours()` silently meant "UTC day" and "UTC time".
 * A trip leaving Cairo at 01:00 then appeared under the previous day's search, and
 * reminder notifications printed departure times two or three hours off.
 * Everything a passenger or driver sees is in Cairo time, so it is computed here.
 */
export const CAIRO_TZ = 'Africa/Cairo';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Minutes Cairo is ahead of UTC at the given instant (120 or 180 with DST). */
function cairoOffsetMinutes(at: Date): number {
  const parts = partsFormatter.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** The UTC instant of 00:00 Cairo time on the given calendar date. */
function cairoMidnight(year: number, month: number, day: number): Date {
  const naive = Date.UTC(year, month - 1, day);
  let instant = naive - cairoOffsetMinutes(new Date(naive)) * 60_000;
  // A DST switch between the guess and the real instant changes the offset; one more
  // pass settles it.
  const corrected = naive - cairoOffsetMinutes(new Date(instant)) * 60_000;
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/**
 * Start (inclusive) and end (exclusive) of a Cairo calendar day. Accepts `YYYY-MM-DD`
 * or a full ISO string, of which only the date part is used — the app sends the day
 * the user picked, not an instant.
 */
export function cairoDayBounds(date: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) throw new Error(`Invalid date: ${date}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = cairoMidnight(year, month, day);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const end = cairoMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { start, end };
}

/** "HH:mm" in Cairo time, for notification text. */
export function formatCairoTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CAIRO_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** A Cairo-local date for notification and error text, e.g. "١٢‏/١٠‏/٢٠٢٦". */
export function formatCairoDate(date: Date): string {
  return date.toLocaleDateString('ar-EG', { timeZone: CAIRO_TZ });
}

/** The first instant of the current month in Cairo. */
export function startOfCairoMonth(now = new Date()): Date {
  const parts = partsFormatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return cairoMidnight(get('year'), get('month'), 1);
}
