// Lógica de seleção, sem DOM. Uma seleção é sempre:
//   dates:  dias soltos, em ordem (single-date usa no máximo um)
//   ranges: intervalos [início, fim] fechados, em ordem e sem sobreposição
//   anchor: início escolhido de um intervalo que ainda não tem fim
import { DAY_MS, toISODate, parseISODate, zonedMidnight } from './date-utils.js';

export const MODES = ['single-date', 'single-range', 'multiple-dates', 'multiple-ranges'];
export const isRangeMode = mode => mode === 'single-range' || mode === 'multiple-ranges';

export const emptySelection = () => ({ dates: [], ranges: [], anchor: null });

function sortedIndex(list, n) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] < n) lo = mid + 1; else hi = mid; }
  return lo;
}

// Junta intervalos que se sobrepõem ou se encostam.
export function mergeRanges(ranges) {
  const sorted = ranges.map(r => [Math.min(r[0], r[1]), Math.max(r[0], r[1])]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push(r);
  }
  return out;
}

// Índice do intervalo que contém n, ou -1.
export function findRange(ranges, n) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, [s, e] = ranges[mid];
    if (n < s) hi = mid - 1; else if (n > e) lo = mid + 1; else return mid;
  }
  return -1;
}

// Novo estado depois de um clique no dia n.
export function applyClick(sel, n, mode, allowDeselect = false) {
  const { dates, ranges, anchor } = sel;
  switch (mode) {
    case 'single-date':
      if (dates.length === 1 && dates[0] === n) return allowDeselect ? emptySelection() : sel;
      return { dates: [n], ranges: [], anchor: null };

    case 'multiple-dates': {
      const i = sortedIndex(dates, n);
      if (dates[i] === n) {
        if (!allowDeselect && dates.length === 1) return sel;
        return { ...sel, dates: dates.slice(0, i).concat(dates.slice(i + 1)) };
      }
      return { ...sel, dates: dates.slice(0, i).concat([n], dates.slice(i)) };
    }

    case 'single-range':
      if (anchor === null) return { dates: [], ranges: [], anchor: n };
      if (n === anchor) return allowDeselect ? emptySelection() : { dates: [], ranges: [[n, n]], anchor: null };
      if (n < anchor) return { dates: [], ranges: [], anchor: n };
      return { dates: [], ranges: [[anchor, n]], anchor: null };

    case 'multiple-ranges': {
      if (anchor === null) {
        const hit = findRange(ranges, n);
        if (hit >= 0 && allowDeselect) return { ...sel, ranges: ranges.filter((_, i) => i !== hit) };
        return { ...sel, anchor: n };
      }
      if (n === anchor) {
        return allowDeselect ? { ...sel, anchor: null } : { ...sel, ranges: mergeRanges([...ranges, [n, n]]), anchor: null };
      }
      if (n < anchor) return { ...sel, anchor: n };
      return { ...sel, ranges: mergeRanges([...ranges, [anchor, n]]), anchor: null };
    }
    default:
      return sel;
  }
}

// Visual de um dia: faixa (b-f inteira, b-r metade direita, b-l metade esquerda),
// círculo (sel preenchido, ring contorno da prévia).
export function dayVisual(n, sel, hover) {
  let band = '', circle = '';
  if (sel.dates.length && sel.dates[sortedIndex(sel.dates, n)] === n) circle = 'sel';
  const ri = sel.ranges.length ? findRange(sel.ranges, n) : -1;
  if (ri >= 0) {
    const [s, e] = sel.ranges[ri];
    if (s === e) circle = 'sel';
    else if (n === s) { circle = 'sel'; band = 'b-r'; }
    else if (n === e) { circle = 'sel'; band = 'b-l'; }
    else band = 'b-f';
  }
  const a = sel.anchor;
  if (a !== null) {
    if (n === a) circle = 'sel';
    if (hover !== null && hover > a && n >= a && n <= hover) {
      if (n === a) { if (band !== 'b-f') band = band === 'b-l' ? 'b-f' : 'b-r'; }
      else if (n === hover) { if (band !== 'b-f') band = band === 'b-r' ? 'b-f' : 'b-l'; if (!circle) circle = 'ring'; }
      else band = 'b-f';
    }
  }
  return { band, circle };
}

// ---------- Entrada e saída ----------

const asDay = v => (typeof v === 'number' ? v : parseISODate(v));

// Converte um valor externo (texto, lista ou objeto) numa seleção do modo.
export function selectionFromValue(mode, value) {
  const sel = emptySelection();
  if (value == null || value === '') return sel;
  const list = Array.isArray(value) ? value : [value];
  if (mode === 'single-date') {
    const n = asDay(list[0]);
    if (n !== null) sel.dates = [n];
  } else if (mode === 'multiple-dates') {
    sel.dates = [...new Set(list.map(asDay).filter(n => n !== null))].sort((a, b) => a - b);
  } else {
    const pairs = [];
    for (const item of list) {
      const s = asDay(item?.start ?? item?.[0]), e = asDay(item?.end ?? item?.[1]);
      if (s !== null && e !== null) pairs.push([s, e]);
      else if (s !== null && mode === 'single-range') sel.anchor = s;
    }
    sel.ranges = mode === 'single-range' ? mergeRanges(pairs.slice(0, 1)) : mergeRanges(pairs);
    if (sel.ranges.length) sel.anchor = mode === 'single-range' ? null : sel.anchor;
  }
  return sel;
}

// Os três formatos de cada data, como as saídas do reusable do Bubble:
// date "AAAA-MM-DD", utc (meia-noite UTC) e tz (meia-noite no fuso escolhido).
export function describeDay(n, timeZone) {
  return { date: toISODate(n), utc: new Date(n * DAY_MS).toISOString(), tz: zonedMidnight(n, timeZone).toISOString() };
}

export function describeSelection(sel, mode, timeZone) {
  const d = n => describeDay(n, timeZone);
  const base = { mode, pending: sel.anchor !== null ? d(sel.anchor) : null };
  switch (mode) {
    case 'single-date':
      return { ...base, date: sel.dates.length ? d(sel.dates[0]) : null };
    case 'multiple-dates':
      return { ...base, dates: sel.dates.map(d) };
    case 'single-range': {
      const r = sel.ranges[0];
      return { ...base, start: r ? d(r[0]) : base.pending, end: r ? d(r[1]) : null, complete: Boolean(r) };
    }
    default:
      return { ...base, ranges: sel.ranges.map(([s, e]) => ({ start: d(s), end: d(e) })) };
  }
}

// Valor simples (só datas "AAAA-MM-DD") para formulários.
export function selectionValue(sel, mode) {
  switch (mode) {
    case 'single-date': return sel.dates.length ? toISODate(sel.dates[0]) : null;
    case 'multiple-dates': return sel.dates.map(toISODate);
    case 'single-range': {
      const r = sel.ranges[0];
      if (r) return { start: toISODate(r[0]), end: toISODate(r[1]) };
      return sel.anchor !== null ? { start: toISODate(sel.anchor), end: null } : null;
    }
    default: return sel.ranges.map(([s, e]) => ({ start: toISODate(s), end: toISODate(e) }));
  }
}
