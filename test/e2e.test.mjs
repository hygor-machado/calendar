// Testes no navegador (Chromium via Playwright), usando a página de demonstração.
//   npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer } from './server.mjs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* tenta o caminho da variável abaixo */ }
  if (process.env.PLAYWRIGHT_MODULE) return createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
  throw new Error('Playwright não encontrado. Rode "npm install" e "npx playwright install chromium".');
}

let server, browser, base;
before(async () => {
  const { chromium } = await loadPlaywright();
  server = await startServer(0);
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
});
after(async () => { await browser?.close(); server?.close(); });

const dayN = iso => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const day = iso => `button.vc-day[data-day="${dayN(iso)}"]`;

async function open(query = '', viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, timezoneId: 'America/Campo_Grande', locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?today=2026-11-07&timezone=America/Campo_Grande${query}`);
  await page.waitForFunction(() => document.querySelector('#calendar .vc-root'));
  page.errors = errors;
  return page;
}

const status = page => page.textContent('#calendar-load-status');
const months = page => page.$$eval('.vc-month .vc-month-title', e => e.map(x => x.textContent));

test('lista: carga progressiva até o limite e janela virtual', async () => {
  const page = await open();
  assert.match(await status(page), /Disponíveis: 4 \+ 0/);
  assert.deepEqual(await months(page), ['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']);
  const next = page.getByRole('button', { name: 'Load next months', exact: true });
  for (let i = 0; i < 6; i++) await next.click();
  assert.match(await status(page), /Disponíveis: 22 \+ 0/);
  assert.ok((await months(page)).length <= 9, 'no máximo 9 meses no DOM');
  await next.click();
  assert.match(await status(page), /Disponíveis: 24 \+ 0/);
  assert.equal(await next.isVisible(), false, 'botão some no limite');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => [...document.querySelectorAll('.vc-month-title')].some(t => t.textContent === 'Oct 2028'));
  assert.ok(!(await months(page)).includes('Nov 2026'), 'meses longe da tela saem do DOM');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Load previous months', exact: true }).click();
  assert.match(await status(page), /\+ 1 anteriores/);
  assert.equal((await months(page))[0], 'Oct 2026');
  assert.deepEqual(page.errors, []);
});

test('lista: intervalo entre meses, prévia e saídas no fuso', async () => {
  const page = await open();
  await page.click(day('2026-11-10'));
  await page.hover(day('2026-12-08'));
  assert.match(await page.getAttribute(day('2026-12-08'), 'class'), /\bring\b/);
  assert.match(await page.getAttribute(day('2026-11-30'), 'class'), /\bb-f\b/);
  await page.click(day('2026-12-08'));
  assert.equal(await page.textContent('#selection-output'), 'Seleção: 2026-11-10 → 2026-12-08');
  const details = await page.textContent('#selection-details');
  assert.match(details, /RangeStartUTC2026-11-10T00:00:00.000Z/);
  assert.match(details, /RangeStartDateTZ2026-11-10T04:00:00.000Z/);
  assert.match(await page.getAttribute(day('2026-11-10'), 'class'), /\bsel\b/);
  assert.equal(await page.getAttribute(day('2026-11-20'), 'aria-pressed'), 'true');
  assert.deepEqual(page.errors, []);
});

test('grade: navegação, visões de mês e ano e drill-down', async () => {
  const page = await open('&breakpoint=0&months-to-show=2', { width: 1280, height: 900 });
  const titles = () => page.$$eval('.vc-title', t => t.map(x => x.textContent));
  assert.deepEqual(await titles(), ['November 2026', 'December 2026']);
  await page.click('[data-act="next"]');
  assert.deepEqual(await titles(), ['December 2026', 'January 2027']);
  await page.click('[data-act="prev"]');
  await page.click('.vc-title >> nth=0');
  assert.deepEqual(await titles(), ['2026']);
  await page.click('.vc-title');
  assert.deepEqual(await titles(), ['2026 – 2037']);
  await page.click('button.vc-pick:has-text("2029")');
  await page.click('button.vc-pick:has-text("Apr")');
  assert.deepEqual(await titles(), ['April 2029', 'May 2029']);
  assert.deepEqual(page.errors, []);
});

test('grade de um mês: dias de fora com 40% e sem clique', async () => {
  const page = await open('&breakpoint=0&months-to-show=1&week-start=1', { width: 1280, height: 900 });
  const outside = await page.$$eval('.vc-day.out', e => e.map(x => [x.textContent, getComputedStyle(x).opacity]));
  assert.ok(outside.length > 0);
  assert.ok(outside.every(([, o]) => o === '0.4'));
  assert.equal(await page.textContent('.vc-weekdays span'), 'Mon');
  await page.goto(`${base}?today=2026-11-07&breakpoint=0&months-to-show=1&hide-outside-days`);
  await page.waitForSelector('.vc-panel');
  assert.equal(await page.$$eval('.vc-day.out', e => e.length), 0);
});

test('teclado: setas movem o foco, Enter seleciona, PageDown troca o mês', async () => {
  const page = await open('&breakpoint=0&months-to-show=1&selection-mode=single-date', { width: 1280, height: 900 });
  await page.focus(day('2026-11-10'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.textContent('#selection-output'), 'Seleção: 2026-11-18');
  await page.keyboard.press('PageDown');
  assert.equal(await page.textContent('.vc-title'), 'December 2026');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.day), String(dayN('2026-12-18')));
});

test('modos múltiplos e desmarcar', async () => {
  const page = await open('&selection-mode=multiple-dates');
  for (const d of ['2026-11-03', '2026-11-12', '2026-11-20']) await page.click(day(d));
  await page.click(day('2026-11-12'));
  assert.equal(await page.textContent('#selection-output'), 'Seleção: 2 datas — 2026-11-03, 2026-11-20');

  const p2 = await open('&selection-mode=multiple-ranges');
  for (const d of ['2026-11-03', '2026-11-05', '2026-11-12', '2026-11-19']) await p2.click(day(d));
  assert.equal(await p2.textContent('#selection-output'), 'Seleção: 2 intervalos — 2026-11-03 → 2026-11-05, 2026-11-12 → 2026-11-19');
  await p2.click(day('2026-11-15'));
  assert.equal(await p2.textContent('#selection-output'), 'Seleção: 1 intervalo — 2026-11-03 → 2026-11-05');
});

test('datas mínima e máxima ficam desativadas', async () => {
  const page = await open('&min=2026-11-05&max=2026-11-25&selection-mode=single-date');
  assert.equal(await page.isDisabled(day('2026-11-04')), true);
  assert.equal(await page.isDisabled(day('2026-11-05')), false);
  assert.equal(await page.isDisabled(day('2026-11-26')), true);
});

test('lista com altura própria rola por dentro', async () => {
  const page = await open('&list-max-height=500');
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Load next months', exact: true }).click();
  const box = await page.$eval('.vc-list', l => [l.clientHeight, l.scrollHeight > l.clientHeight]);
  assert.deepEqual(box, [500, true]);
  await page.$eval('.vc-list', l => { l.scrollTop = 4000; });
  await page.waitForFunction(() => !document.querySelector('.vc-month[data-serial="24322"]'));
  await page.evaluate(() => document.getElementById('calendar').goToDate('2026-12-15'));
  assert.ok((await months(page)).includes('Dec 2026'));
});

test('API: value, goToDate e eventos', async () => {
  const page = await open('&breakpoint=0&selection-mode=single-range', { width: 1280, height: 900 });
  const detail = await page.evaluate(() => new Promise(resolve => {
    const cal = document.getElementById('calendar');
    cal.addEventListener('vc-change', e => resolve(e.detail), { once: true });
    cal.value = { start: '2027-03-02', end: '2027-03-09' };
    cal.goToDate('2027-03-01');
    cal.clearSelection();
  }));
  assert.equal(detail.mode, 'single-range');
  assert.equal(await page.textContent('.vc-title'), 'March 2027');
  assert.equal(await page.evaluate(() => document.getElementById('calendar').value), null);
});
