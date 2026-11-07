// Testes sem navegador: datas, fuso horário e seleção.  node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/date-utils.js';
import * as S from '../src/selection.js';

const n = iso => D.parseISODate(iso);

test('datas como números de dia', () => {
  assert.equal(D.toISODate(n('2026-11-07')), '2026-11-07');
  assert.equal(n('2026-02-30'), null);
  assert.equal(n(''), null);
  assert.equal(n('2024-02-29') + 1, n('2024-03-01'));
  assert.equal(D.weekday(n('2026-11-07')), 6); // sábado
  assert.equal(D.weekday(n('1970-01-01')), 4);
  assert.equal(D.daysInSerial(D.monthSerial(2028, 1)), 29);
  assert.equal(D.serialOfDay(n('2026-12-31')), 2026 * 12 + 11);
});

test('layout natural e fixed', () => {
  const nov = D.monthSerial(2026, 10); // 1º de novembro de 2026 é domingo
  assert.deepEqual(D.monthLayout(nov, { weekStart: 0 }), { first: n('2026-11-01'), days: 30, offset: 0, rows: 5 });
  assert.equal(D.monthLayout(nov, { weekStart: 1 }).offset, 6);
  assert.equal(D.monthLayout(nov, { weekStart: 1 }).rows, 6);
  assert.equal(D.monthLayout(nov, { alignment: 'fixed', startColumn: 3 }).offset, 3);
  assert.deepEqual(D.columnWeekdays(nov, { weekStart: 1 }), [1, 2, 3, 4, 5, 6, 0]);
  // fixed com o dia 1 (domingo) na coluna 3: colunas começam na quinta.
  assert.deepEqual(D.columnWeekdays(nov, { alignment: 'fixed', startColumn: 3 }), [4, 5, 6, 0, 1, 2, 3]);
});

test('meia-noite no fuso', () => {
  assert.equal(D.zonedMidnight(n('2026-11-10'), 'America/Campo_Grande').toISOString(), '2026-11-10T04:00:00.000Z');
  assert.equal(D.zonedMidnight(n('2026-11-10'), 'Asia/Tokyo').toISOString(), '2026-11-09T15:00:00.000Z');
  assert.equal(D.zonedMidnight(n('2026-11-10'), 'UTC').toISOString(), '2026-11-10T00:00:00.000Z');
  // 2018-11-04: o horário de verão de São Paulo começou à meia-noite; o dia começou à 01:00.
  assert.equal(D.zonedMidnight(n('2018-11-04'), 'America/Sao_Paulo').toISOString(), '2018-11-04T03:00:00.000Z');
  assert.equal(D.todayInZone('Asia/Tokyo', Date.parse('2026-11-07T20:00:00Z')), n('2026-11-08'));
  assert.equal(D.isValidTimeZone('America/Cuiaba'), true);
  assert.equal(D.isValidTimeZone('Mars/Base'), false);
});

const click = (sel, iso, mode, allow = false) => S.applyClick(sel, n(iso), mode, allow);
const dates = sel => sel.dates.map(D.toISODate);
const ranges = sel => sel.ranges.map(([s, e]) => `${D.toISODate(s)}/${D.toISODate(e)}`);

test('single-date', () => {
  let s = click(S.emptySelection(), '2026-11-10', 'single-date');
  assert.deepEqual(dates(s), ['2026-11-10']);
  s = click(s, '2026-11-12', 'single-date');
  assert.deepEqual(dates(s), ['2026-11-12']);
  assert.deepEqual(dates(click(s, '2026-11-12', 'single-date', false)), ['2026-11-12']);
  assert.deepEqual(dates(click(s, '2026-11-12', 'single-date', true)), []);
});

test('multiple-dates', () => {
  let s = S.emptySelection();
  for (const d of ['2026-11-12', '2026-11-03', '2026-11-20']) s = click(s, d, 'multiple-dates');
  assert.deepEqual(dates(s), ['2026-11-03', '2026-11-12', '2026-11-20']);
  s = click(s, '2026-11-12', 'multiple-dates');
  assert.deepEqual(dates(s), ['2026-11-03', '2026-11-20']);
  s = click(click(s, '2026-11-03', 'multiple-dates'), '2026-11-20', 'multiple-dates');
  assert.deepEqual(dates(s), ['2026-11-20'], 'o último dia só sai com allow-deselect');
  assert.deepEqual(dates(click(s, '2026-11-20', 'multiple-dates', true)), []);
});

test('single-range', () => {
  let s = click(S.emptySelection(), '2026-11-10', 'single-range');
  assert.equal(D.toISODate(s.anchor), '2026-11-10');
  s = click(s, '2026-12-08', 'single-range');
  assert.deepEqual(ranges(s), ['2026-11-10/2026-12-08']);
  assert.equal(s.anchor, null);
  s = click(s, '2026-11-20', 'single-range');
  assert.deepEqual(ranges(s), []);
  s = click(s, '2026-11-15', 'single-range'); // antes do início: vira o novo início
  assert.equal(D.toISODate(s.anchor), '2026-11-15');
  assert.deepEqual(ranges(click(s, '2026-11-15', 'single-range')), ['2026-11-15/2026-11-15']);
  assert.deepEqual(click(s, '2026-11-15', 'single-range', true), S.emptySelection());
});

test('multiple-ranges junta intervalos e permite remover', () => {
  let s = S.emptySelection();
  for (const d of ['2026-11-03', '2026-11-05', '2026-11-12', '2026-11-19', '2026-11-06', '2026-11-08']) s = click(s, d, 'multiple-ranges');
  assert.deepEqual(ranges(s), ['2026-11-03/2026-11-08', '2026-11-12/2026-11-19']);
  s = click(s, '2026-11-15', 'multiple-ranges', true);
  assert.deepEqual(ranges(s), ['2026-11-03/2026-11-08']);
  assert.deepEqual(S.mergeRanges([[5, 9], [1, 2], [3, 4], [20, 21]]), [[1, 9], [20, 21]]);
});

test('visual do dia: faixa, círculo e prévia', () => {
  const sel = { dates: [], ranges: [[n('2026-11-10'), n('2026-11-14')]], anchor: null };
  assert.deepEqual(S.dayVisual(n('2026-11-10'), sel, null), { band: 'b-r', circle: 'sel' });
  assert.deepEqual(S.dayVisual(n('2026-11-12'), sel, null), { band: 'b-f', circle: '' });
  assert.deepEqual(S.dayVisual(n('2026-11-14'), sel, null), { band: 'b-l', circle: 'sel' });
  assert.deepEqual(S.dayVisual(n('2026-11-15'), sel, null), { band: '', circle: '' });
  const pending = { dates: [], ranges: [], anchor: n('2026-11-10') };
  const hover = n('2026-11-13');
  assert.deepEqual(S.dayVisual(n('2026-11-10'), pending, hover), { band: 'b-r', circle: 'sel' });
  assert.deepEqual(S.dayVisual(n('2026-11-11'), pending, hover), { band: 'b-f', circle: '' });
  assert.deepEqual(S.dayVisual(n('2026-11-13'), pending, hover), { band: 'b-l', circle: 'ring' });
  assert.deepEqual(S.dayVisual(n('2026-11-14'), pending, hover), { band: '', circle: '' });
  assert.deepEqual(S.dayVisual(n('2026-11-09'), pending, n('2026-11-09')), { band: '', circle: '' }, 'sem prévia antes do início');
});

test('entrada e saída de valores', () => {
  const sel = S.selectionFromValue('multiple-ranges', [{ start: '2026-11-01', end: '2026-11-03' }, ['2026-11-02', '2026-11-06']]);
  assert.deepEqual(S.selectionValue(sel, 'multiple-ranges'), [{ start: '2026-11-01', end: '2026-11-06' }]);
  const one = S.selectionFromValue('single-date', '2026-11-10');
  const out = S.describeSelection(one, 'single-date', 'America/Campo_Grande');
  assert.deepEqual(out.date, { date: '2026-11-10', utc: '2026-11-10T00:00:00.000Z', tz: '2026-11-10T04:00:00.000Z' });
  const half = S.applyClick(S.emptySelection(), n('2026-11-10'), 'single-range');
  assert.deepEqual(S.selectionValue(half, 'single-range'), { start: '2026-11-10', end: null });
  assert.equal(S.describeSelection(half, 'single-range', 'UTC').complete, false);
});
