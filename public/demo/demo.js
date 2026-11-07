// Página de demonstração: mesmo papel da página zz-virtual-* do Bubble.
const cal = document.getElementById('calendar');
const $ = id => document.getElementById(id);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ZONES = ['America/Sao_Paulo', 'America/Campo_Grande', 'America/Cuiaba', 'America/Manaus', 'America/Fortaleza', 'America/Noronha',
  'America/New_York', 'America/Los_Angeles', 'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Cada campo vira um atributo do <virtual-calendar>, com o mesmo nome no endereço da página.
const FIELDS = [
  { attr: 'locale', label: 'Idioma', type: 'select', def: 'en-US', options: [['en-US', 'English'], ['pt-BR', 'Português'], ['es-ES', 'Español']] },
  { attr: 'timezone', label: 'Fuso horário — TimezoneID', type: 'text', def: browserZone, list: ZONES },
  { attr: 'view', label: 'Visualização inicial — ViewType', type: 'select', def: 'date', options: [['date', 'Date'], ['month', 'Month'], ['year', 'Year']] },
  { attr: 'selection-mode', label: 'Modo de seleção — SelectionMode', type: 'select', def: 'single-range',
    options: [['single-date', 'Single Date'], ['single-range', 'Single Range'], ['multiple-dates', 'Multiple Dates'], ['multiple-ranges', 'Multiple Ranges']] },
  { attr: 'alignment', label: 'Modo de alinhamento — AlignmentMode', type: 'select', def: 'natural', options: [['natural', 'Natural'], ['fixed', 'Fixed']] },
  { attr: 'week-start', label: 'Primeiro dia da semana — WeekStartOn', type: 'select', def: '0', options: WEEKDAYS.map((w, i) => [String(i), w]) },
  { attr: 'start-column', label: 'Coluna inicial no modo fixed — 0 a 6', type: 'number', def: '0', min: 0, max: 6 },
  { attr: 'initial-date', label: 'Data inicial — vazio usa hoje', type: 'date', def: '' },
  { attr: 'today', label: 'Hoje simulado — opcional', type: 'date', def: '' },
  { attr: 'months-to-show', label: 'Calendários lado a lado — MonthsToShow', type: 'number', def: '2', min: 1, max: 12 },
  { attr: 'breakpoint', label: 'Breakpoint — 99999 força modo lista', type: 'number', def: '99999', min: 0 },
  { attr: 'list-initial-months', label: 'Meses iniciais — ListInitialMonths', type: 'number', def: '4', min: 1 },
  { attr: 'list-max-months', label: 'Limite atual + futuros — ListMaxMonths', type: 'number', def: '24', min: 1 },
  { attr: 'list-max-prev-months', label: 'Limite de anteriores — ListMaxPrevMonths', type: 'number', def: '12', min: 0 },
  { attr: 'load-prev-step', label: 'Anteriores por clique — LoadPrevStep', type: 'number', def: '1', min: 1 },
  { attr: 'load-next-step', label: 'Próximos por clique — LoadNextStep', type: 'number', def: '3', min: 1 },
  { attr: 'list-max-height', label: 'Altura da lista — 0 = rolar a página', type: 'number', def: '0', min: 0 },
  { attr: 'virtual-window-months', label: 'Janela virtual — VirtualWindowMonths', type: 'number', def: '9', min: 3 },
  { attr: 'month-block-height', label: 'Altura de cada mês — 0 = automática', type: 'number', def: '0', min: 0 },
  { attr: 'min', label: 'Data mínima — opcional', type: 'date', def: '' },
  { attr: 'max', label: 'Data máxima — opcional', type: 'date', def: '' },
  { attr: 'allow-deselect', label: 'Permitir desmarcar a seleção', type: 'toggle', def: true },
  { attr: 'hide-outside-days', label: 'Ocultar dias externos', type: 'toggle', def: false },
  { attr: 'hover-preview', label: 'Prévia do intervalo — HoverPreview', type: 'toggle', def: true },
  { attr: 'auto-load', label: 'Carregar ao chegar no fim da lista', type: 'toggle', def: false }
];

// ---------- Configuração <-> endereço ----------

function configFromURL() {
  const q = new URLSearchParams(location.search);
  const cfg = {};
  for (const f of FIELDS) {
    let v = q.get(f.attr);
    if (f.attr === 'hover-preview' && q.get('hover') === '0') v = 'false';
    if (v === null) cfg[f.attr] = f.def;
    else cfg[f.attr] = f.type === 'toggle' ? v !== 'false' && v !== '0' : v;
  }
  return cfg;
}

function configToURL(cfg) {
  const q = new URLSearchParams();
  for (const f of FIELDS) {
    const v = cfg[f.attr];
    if (f.type === 'toggle' ? v !== f.def : String(v) !== String(f.def)) q.set(f.attr, f.type === 'toggle' ? String(v) : v);
  }
  const s = q.toString();
  try { history.replaceState(null, '', s ? `?${s}` : location.pathname); } catch { /* página dentro de um frame restrito */ }
}

function applyToCalendar(cfg) {
  for (const f of FIELDS) {
    const v = cfg[f.attr];
    if (f.type === 'toggle') {
      if (f.attr === 'hover-preview') cal.setAttribute(f.attr, v ? 'true' : 'false');
      else if (v) cal.setAttribute(f.attr, ''); else cal.removeAttribute(f.attr);
    } else if (v === '' || v === null || v === undefined) cal.removeAttribute(f.attr);
    else cal.setAttribute(f.attr, v);
  }
}

// ---------- Painel de configurações ----------

function buildFields(cfg) {
  const box = $('settings-fields');
  box.replaceChildren();
  for (const f of FIELDS) {
    const id = `settings-${f.attr}`;
    const label = document.createElement('label');
    label.className = f.type === 'toggle' ? 'field toggle' : 'field';
    label.htmlFor = id;
    const text = document.createElement('span');
    text.textContent = f.label;
    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      for (const [value, name] of f.options) input.add(new Option(name, value));
      input.value = cfg[f.attr];
    } else {
      input = document.createElement('input');
      input.type = f.type === 'toggle' ? 'checkbox' : f.type;
      if (f.type === 'toggle') input.checked = Boolean(cfg[f.attr]);
      else input.value = cfg[f.attr];
      if (f.min !== undefined) input.min = f.min;
      if (f.max !== undefined) input.max = f.max;
      if (f.type === 'number') input.inputMode = 'numeric';
      if (f.list) {
        const dl = document.createElement('datalist');
        dl.id = `${id}-list`;
        for (const z of f.list) dl.append(new Option(z));
        input.setAttribute('list', dl.id);
        label.append(dl);
      }
      if (f.type === 'text') { input.autocomplete = 'off'; input.spellcheck = false; }
    }
    input.id = id;
    input.name = f.attr;
    if (f.type === 'toggle') label.append(input, text); else label.append(text, input);
    box.append(label);
  }
}

function readFields() {
  const cfg = {};
  for (const f of FIELDS) {
    const input = $(`settings-${f.attr}`);
    cfg[f.attr] = f.type === 'toggle' ? input.checked : input.value.trim();
  }
  return cfg;
}

// ---------- Textos da página ----------

let current = configFromURL();

function updateIntro(cfg) {
  const isList = layoutOf(cfg) === 'list';
  $('intro-text').textContent = isList
    ? `Abertura: ${cfg['list-initial-months']} meses. Load previous: +${cfg['load-prev-step']}. Load next: +${cfg['load-next-step']}. `
      + `Quando a lista passa de ${cfg['virtual-window-months']} meses, só uma janela fica desenhada. Abra Settings para ajustar os inputs.`
    : `Modo grade: ${cfg['months-to-show']} ${Number(cfg['months-to-show']) === 1 ? 'mês' : 'meses lado a lado'}. `
      + 'Clique no título para trocar a visão (dia → mês → ano). Abra Settings para ajustar os inputs.';
  for (const b of document.querySelectorAll('.segmented button')) b.setAttribute('aria-pressed', String(b.dataset.layout === layoutOf(cfg)));
}

function layoutOf(cfg) {
  const width = cal.getBoundingClientRect().width || window.innerWidth;
  return width < Number(cfg.breakpoint) ? 'list' : 'grid';
}

function selectionText(d) {
  if (!d) return 'Seleção: —';
  const pend = d.pending ? ` (início: ${d.pending.date})` : '';
  switch (d.mode) {
    case 'single-date': return `Seleção: ${d.date ? d.date.date : '—'}`;
    case 'single-range': return d.start ? `Seleção: ${d.start.date} → ${d.end ? d.end.date : ''}` : 'Seleção: —';
    case 'multiple-dates': return d.dates.length ? `Seleção: ${d.dates.length} ${d.dates.length === 1 ? 'data' : 'datas'} — ${d.dates.map(x => x.date).join(', ')}` : 'Seleção: —';
    default: return d.ranges.length || d.pending
      ? `Seleção: ${d.ranges.length} ${d.ranges.length === 1 ? 'intervalo' : 'intervalos'}${d.ranges.length ? ' — ' : ''}${d.ranges.map(r => `${r.start.date} → ${r.end.date}`).join(', ')}${pend}`
      : 'Seleção: —';
  }
}

function showSelection(d) {
  $('selection-output').textContent = selectionText(d);
  const rows = [];
  if (d?.mode === 'single-date' && d.date) rows.push(['SelectedUTCDate', d.date.utc], ['SelectedDateTZ', d.date.tz]);
  if (d?.mode === 'single-range' && d.start) {
    rows.push(['RangeStartUTC', d.start.utc], ['RangeStartDateTZ', d.start.tz]);
    if (d.end) rows.push(['RangeEndUTC', d.end.utc], ['RangeEndDateTZ', d.end.tz]);
  }
  if (d && (d.mode === 'multiple-dates' || d.mode === 'multiple-ranges') && (d.dates?.length || d.ranges?.length)) rows.push(['value', JSON.stringify(cal.value)]);
  const dl = $('selection-details');
  dl.replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; return [dt, dd]; }));
}

function showStatus() {
  const s = cal.state;
  $('calendar-load-status').textContent = s.layout === 'list' && s.list
    ? `Disponíveis: ${s.list.available} + ${s.list.previous} anteriores. Janela: ${s.list.window}.`
    : `Modo grade. Mês inicial: ${s.month.slice(0, 7)}.`;
}

cal.addEventListener('vc-change', e => showSelection(e.detail));
cal.addEventListener('vc-list-change', showStatus);
cal.addEventListener('vc-view-change', () => { showStatus(); updateIntro(current); });

// ---------- Ações ----------

function apply(cfg) {
  current = cfg;
  applyToCalendar(cfg);
  configToURL(cfg);
  // Espera o componente ler os atributos (ele junta as mudanças num microtask).
  queueMicrotask(() => { cal.reset(); showStatus(); updateIntro(cfg); });
}

$('settings-toggle').addEventListener('click', () => {
  const panel = $('settings-panel');
  panel.hidden = !panel.hidden;
  $('settings-toggle').setAttribute('aria-expanded', String(!panel.hidden));
});
$('settings-panel').addEventListener('submit', e => { e.preventDefault(); apply(readFields()); });
$('settings-defaults').addEventListener('click', () => {
  const cfg = Object.fromEntries(FIELDS.map(f => [f.attr, f.def]));
  buildFields(cfg);
  apply(cfg);
});
for (const b of document.querySelectorAll('.segmented button')) {
  b.addEventListener('click', () => {
    const cfg = { ...current, breakpoint: b.dataset.layout === 'list' ? '99999' : '0' };
    buildFields(cfg);
    apply(cfg);
  });
}

// ---------- Medir agora ----------

const frame = () => new Promise(r => requestAnimationFrame(() => r(performance.now())));

async function measure() {
  const out = $('bench-output');
  const btn = $('bench-run');
  btn.disabled = true;
  out.hidden = false;
  out.textContent = 'Medindo…';
  const startY = window.scrollY;
  const before = cal.value;
  const tasks = [];
  let po = null;
  try {
    po = new PerformanceObserver(list => tasks.push(...list.getEntries()));
    po.observe({ type: 'longtask' });
  } catch { po = null; }
  const gaps = [];
  let last = await frame();
  let running = true;
  (async () => { while (running) { const t = await frame(); gaps.push(t - last); last = t; } })();

  const top = $('calendar-under-test').getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top, behavior: 'instant' });
  await frame();
  for (let i = 0; i < 40; i++) { window.scrollBy({ top: 80, behavior: 'instant' }); await frame(); }
  for (let i = 0; i < 40; i++) { window.scrollBy({ top: -80, behavior: 'instant' }); await frame(); }
  window.scrollBy({ top: 2400, behavior: 'instant' }); await frame(); await frame();
  window.scrollBy({ top: -2400, behavior: 'instant' }); await frame(); await frame();

  // Clique num dia visível perto do meio da tela.
  const days = [...cal.querySelectorAll('button.vc-day:not(:disabled)')].filter(d => {
    const r = d.getBoundingClientRect();
    return r.top > 60 && r.bottom < window.innerHeight - 20;
  });
  let click = null;
  if (days.length) {
    const d = days[Math.floor(days.length / 2)];
    const t0 = performance.now();
    d.click();
    const t1 = performance.now();
    const t2 = await frame();
    click = { handler: t1 - t0, toFrame: t2 - t0 };
    cal.value = before;
    showSelection(cal.selection);
  }
  running = false;
  await frame();
  po?.disconnect();
  window.scrollTo({ top: startY, behavior: 'instant' });

  const s = cal.state;
  const lt = tasks.reduce((a, t) => a + t.duration, 0);
  const max = gaps.length ? Math.max(...gaps) : 0;
  const lines = [
    `Rolagem: ${gaps.length} quadros, maior intervalo ${max.toFixed(1)} ms, ${gaps.filter(g => g > 50).length} acima de 50 ms.`,
    po ? `Long tasks: ${tasks.length} (${lt.toFixed(0)} ms no total).` : 'Long tasks: este navegador não informa.',
    click ? `Clique num dia: ${click.handler.toFixed(1)} ms no código, ${click.toFrame.toFixed(1)} ms até o próximo quadro.` : 'Clique: nenhum dia visível.',
    `DOM do calendário: ${cal.querySelectorAll('*').length} elementos.`,
    s.list ? `Meses carregados: ${s.list.total}. Meses desenhados agora: ${s.list.rendered}.` : `Modo grade: ${cal.querySelectorAll('.vc-panel').length} painel(is).`
  ];
  out.textContent = lines.join('\n');
  btn.disabled = false;
}
$('bench-run').addEventListener('click', measure);

// ---------- Início ----------

buildFields(current);
applyToCalendar(current);
customElements.whenDefined('virtual-calendar').then(() => {
  queueMicrotask(() => { cal.reset(); showSelection(cal.selection); showStatus(); updateIntro(current); });
});
