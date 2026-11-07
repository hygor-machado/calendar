// Datas de calendário como números inteiros: dias desde 1970-01-01 (UTC).
// Um "serial" de mês é ano * 12 + mês (0 a 11), como no app Bubble.

export const DAY_MS = 86400000;

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const dayNumber = (y, m, d) => Math.floor(Date.UTC(y, m, d) / DAY_MS);

export function fromDayNumber(n) {
  const dt = new Date(n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

export const toISODate = n => new Date(n * DAY_MS).toISOString().slice(0, 10);

// Aceita "AAAA-MM-DD". Devolve null para texto vazio ou data inexistente (ex.: 2026-02-30).
export function parseISODate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const n = dayNumber(y, mo, d);
  const back = fromDayNumber(n);
  return back.y === y && back.m === mo && back.d === d ? n : null;
}

export const monthSerial = (y, m) => y * 12 + m;
export const serialYear = s => Math.floor(s / 12);
export const serialMonth = s => ((s % 12) + 12) % 12;
export const serialOfDay = n => { const { y, m } = fromDayNumber(n); return monthSerial(y, m); };
export const firstDayOfSerial = s => dayNumber(serialYear(s), serialMonth(s), 1);
export const daysInSerial = s => new Date(Date.UTC(serialYear(s), serialMonth(s) + 1, 0)).getUTCDate();

// 0 = domingo. 1970-01-01 foi quinta-feira.
export const weekday = n => (((n + 4) % 7) + 7) % 7;

// Posição do dia 1 e número de semanas do mês.
// natural: o dia 1 cai na coluna do seu dia da semana (a partir de weekStart).
// fixed: o dia 1 sempre cai em startColumn.
export function monthLayout(serial, { weekStart = 0, alignment = 'natural', startColumn = 0 } = {}) {
  const first = firstDayOfSerial(serial);
  const days = daysInSerial(serial);
  const offset = alignment === 'fixed' ? clamp(startColumn, 0, 6) : (weekday(first) - weekStart + 7) % 7;
  return { first, days, offset, rows: Math.ceil((offset + days) / 7) };
}

// Dia da semana mostrado em cada coluna.
export function columnWeekdays(serial, opts = {}) {
  const { first, offset } = monthLayout(serial, opts);
  const base = opts.alignment === 'fixed' ? weekday(first) - offset : (opts.weekStart ?? 0);
  return Array.from({ length: 7 }, (_, c) => (((base + c) % 7) + 7) % 7);
}

// ---------- Fuso horário ----------

const partsCache = new Map();
function zoneFormatter(timeZone) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric'
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

function zoneParts(ts, timeZone) {
  const out = {};
  for (const p of zoneFormatter(timeZone).formatToParts(new Date(ts))) out[p.type] = p.value;
  return { y: +out.year, m: +out.month - 1, d: +out.day, h: +out.hour % 24, mi: +out.minute, s: +out.second };
}

export function isValidTimeZone(timeZone) {
  if (!timeZone) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true; } catch { return false; }
}

export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Dia de hoje no fuso pedido.
export function todayInZone(timeZone, now = Date.now()) {
  const p = zoneParts(now, timeZone);
  return dayNumber(p.y, p.m, p.d);
}

// Diferença entre a hora local do fuso e o UTC, em ms, no instante ts.
export function zoneOffsetMs(ts, timeZone) {
  const p = zoneParts(ts, timeZone);
  return Date.UTC(p.y, p.m, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000;
}

// Instante da meia-noite local do dia n no fuso. Se a meia-noite não existir
// (horário de verão começando às 00:00), devolve o primeiro instante do dia.
export function zonedMidnight(n, timeZone) {
  const base = n * DAY_MS;
  let t = base - zoneOffsetMs(base, timeZone);
  t = base - zoneOffsetMs(t, timeZone);
  const p = zoneParts(t, timeZone);
  if (dayNumber(p.y, p.m, p.d) < n) t += 3600000;
  return new Date(t);
}
