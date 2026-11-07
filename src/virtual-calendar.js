// <virtual-calendar>: calendário sem dependências, inspirado no reusable
// "Calendar Virtual" do Bubble. Dois layouts:
//   grade: 1 a 12 meses lado a lado, com visões de dia, mês e ano;
//   lista: meses empilhados com carga progressiva e janela virtual
//          (só os meses perto da tela ficam no DOM).
import * as D from './date-utils.js';
import * as S from './selection.js';
import { injectStyles } from './styles.js';

export { MODES } from './selection.js';

const ATTRS = [
  'locale', 'timezone', 'view', 'selection-mode', 'allow-deselect', 'hide-outside-days',
  'week-start', 'alignment', 'start-column', 'initial-date', 'today', 'months-to-show',
  'breakpoint', 'list-initial-months', 'list-max-months', 'list-max-prev-months',
  'load-prev-step', 'load-next-step', 'load-prev-label', 'load-next-label', 'list-max-height',
  'virtual-window-months', 'month-block-height', 'hover-preview', 'auto-load', 'min', 'max', 'value'
];

// Mudanças nestes campos voltam o calendário ao estado inicial (data inicial, lista com N meses).
const RESET_KEYS = ['initialDate', 'today', 'view', 'timeZone', 'listInitialMonths', 'listMaxMonths', 'listMaxPrevMonths'];

const TEXT = {
  en: { prev: 'Previous', next: 'Next', loadPrev: 'Load previous months', loadNext: 'Load next months', chooseMonth: 'Choose month', chooseYear: 'Choose year', backToDays: 'Back to days' },
  pt: { prev: 'Anterior', next: 'Próximo', loadPrev: 'Carregar meses anteriores', loadNext: 'Carregar próximos meses', chooseMonth: 'Escolher mês', chooseYear: 'Escolher ano', backToDays: 'Voltar aos dias' },
  es: { prev: 'Anterior', next: 'Siguiente', loadPrev: 'Cargar meses anteriores', loadNext: 'Cargar meses siguientes', chooseMonth: 'Elegir mes', chooseYear: 'Elegir año', backToDays: 'Volver a los días' }
};

const ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const formatterCache = new Map();
function formatters(locale) {
  if (formatterCache.has(locale)) return formatterCache.get(locale);
  let loc = locale;
  try { new Intl.DateTimeFormat(loc); } catch { loc = 'en-US'; }
  const f = o => new Intl.DateTimeFormat(loc, { timeZone: 'UTC', ...o });
  const at = n => new Date(n * D.DAY_MS);
  const cap = s => s.charAt(0).toLocaleUpperCase(loc) + s.slice(1);
  const clean = s => s.replace(/\.$/, '');
  const monthYear = f({ month: 'long', year: 'numeric' });
  const monthShort = f({ month: 'short' });
  const weekdayShort = f({ weekday: 'short' });
  const full = f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortNames = Array.from({ length: 12 }, (_, m) => cap(clean(monthShort.format(at(D.dayNumber(2000, m, 1))))));
  const weekdays = Array.from({ length: 7 }, (_, w) => clean(weekdayShort.format(at(3 + w)))); // 1970-01-04 foi domingo
  const out = {
    monthTitle: s => cap(monthYear.format(at(D.firstDayOfSerial(s)))),
    listTitle: s => `${shortNames[D.serialMonth(s)]} ${D.serialYear(s)}`,
    monthShort: m => shortNames[m],
    weekday: w => weekdays[w],
    dayLabel: n => full.format(at(n))
  };
  formatterCache.set(locale, out);
  return out;
}

function textFor(locale) {
  const lang = String(locale || 'en').slice(0, 2).toLowerCase();
  return TEXT[lang] || TEXT.en;
}

// "2026-11-10", "2026-11-10/2026-11-15" ou vários separados por vírgula.
function parseValueText(text) {
  const items = String(text ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return items.map(item => {
    const [start, end] = item.split('/').map(s => s.trim());
    return end !== undefined ? { start, end } : start;
  });
}

function addMonths(n, k) {
  const { y, m, d } = D.fromDayNumber(n);
  const s = D.monthSerial(y, m) + k;
  return D.dayNumber(D.serialYear(s), D.serialMonth(s), Math.min(d, D.daysInSerial(s)));
}

export class VirtualCalendar extends HTMLElement {
  static get observedAttributes() { return ATTRS; }

  constructor() {
    super();
    this._sel = S.emptySelection();
    this._hover = null;
    this._blocks = new Map();
    this._cells = [];
    this._connected = false;
    this._configQueued = false;
    this._lastWidth = -1;
    this._scrollEl = null;
    this._onScroll = () => this._updateWindow(false);
    this._onWindowResize = () => { if (this._layout === 'list') this._updateWindow(true); };
  }

  // ---------- Ciclo de vida ----------

  connectedCallback() {
    if (this._connected) return;
    this._connected = true;
    injectStyles(this.ownerDocument);
    this.classList.add('vc');
    if (!this._root) {
      this._root = document.createElement('div');
      this._root.className = 'vc-root';
      this.replaceChildren(this._root);
      const r = this._root;
      r.addEventListener('click', e => this._onClick(e));
      r.addEventListener('pointerover', e => { if (e.pointerType !== 'touch') this._setHover(this._dayOf(e.target)); });
      r.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') this._setHover(this._dayOf(e.target)); });
      r.addEventListener('pointercancel', () => this._setHover(null));
      r.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') this._setHover(null); });
      r.addEventListener('keydown', e => this._onKeyDown(e));
      r.addEventListener('focusin', e => { if (e.target.matches?.('button.vc-day:focus-visible')) this._setHover(this._dayOf(e.target)); });
    }
    this._readConfig();
    this._reset(true);
    if (this._pendingValue !== undefined) this._sel = S.selectionFromValue(this.cfg.mode, this._pendingValue);
    else if (this.hasAttribute('value')) this._sel = this._selectionFromAttr(this.getAttribute('value'));
    this._pendingValue = undefined;
    this._paint();
    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(this);
    window.addEventListener('resize', this._onWindowResize, { passive: true });
  }

  disconnectedCallback() {
    this._connected = false;
    this._ro?.disconnect();
    this._io?.disconnect();
    window.removeEventListener('resize', this._onWindowResize);
    this._detachScroll();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._connected || oldValue === newValue) return;
    if (name === 'value') { this._setSelection(this._selectionFromAttr(newValue), false); return; }
    if (this._configQueued) return;
    this._configQueued = true;
    queueMicrotask(() => { this._configQueued = false; if (this._connected) this._applyConfigChange(); });
  }

  // ---------- API pública ----------

  get value() { return this.cfg ? S.selectionValue(this._sel, this.cfg.mode) : this._pendingValue ?? null; }
  set value(v) {
    if (!this.cfg) { this._pendingValue = v; return; }
    this._setSelection(S.selectionFromValue(this.cfg.mode, v), false);
  }

  // Seleção com as três formas de cada data: date, utc e tz.
  get selection() { return this.cfg ? S.describeSelection(this._sel, this.cfg.mode, this.cfg.timeZone) : null; }

  get state() {
    return {
      layout: this._layout, view: this._view, month: D.toISODate(D.firstDayOfSerial(this._viewSerial)),
      today: D.toISODate(this._today), list: this._layout === 'list' ? this._listStatus() : null
    };
  }

  clearSelection() { this._setSelection(S.emptySelection(), true); }

  // Volta à data inicial, limpa a seleção e reinicia a carga de meses ("Aplicar e reiniciar").
  reset() { this._readConfig(); this._reset(true); this._emitChange(); }

  goToDate(date) {
    const n = typeof date === 'number' ? date : D.parseISODate(date instanceof Date ? date.toISOString().slice(0, 10) : date);
    if (n === null) return false;
    const s = D.serialOfDay(n);
    this._focusDay = n;
    if (this._layout === 'list') {
      const i = s - this._listStart;
      if (i < 0 || i >= this._count) {
        this._listAnchor = s; this._prevLoaded = 0; this._futureCount = this.cfg.listInitialMonths;
        this._relayoutList();
        this._scrollToIndex(0);
      } else this._scrollToIndex(i);
      this._paint();
    } else {
      this._viewSerial = s;
      this._view = 'date';
      this._render();
    }
    return true;
  }

  next() { this._step(1); }
  prev() { this._step(-1); }

  setView(view) {
    if (!['date', 'month', 'year'].includes(view)) return;
    if (view === 'month') this._pickerYear = D.serialYear(this._viewSerial);
    if (view === 'year') this._yearStart = this._pickerYear;
    this._view = view;
    this._render();
  }

  loadPrevious() {
    const c = this.cfg;
    if (this._layout !== 'list' || this._prevLoaded >= c.listMaxPrevMonths) return false;
    this._prevLoaded = Math.min(c.listMaxPrevMonths, this._prevLoaded + c.loadPrevStep);
    this._relayoutList();
    return true;
  }

  loadNext() {
    const c = this.cfg;
    if (this._layout !== 'list' || this._futureCount >= c.listMaxMonths) return false;
    this._futureCount = Math.min(c.listMaxMonths, this._futureCount + c.loadNextStep);
    this._relayoutList();
    return true;
  }

  // ---------- Configuração ----------

  _readConfig() {
    const a = name => this.getAttribute(name);
    const flag = name => this.hasAttribute(name) && a(name) !== 'false';
    const int = (name, def, min, max) => { const n = parseInt(a(name), 10); return Number.isFinite(n) ? D.clamp(n, min, max) : def; };
    const tz = a('timezone');
    const locale = a('locale') || 'en-US';
    const t = textFor(locale);
    const mode = a('selection-mode');
    const view = a('view');
    const c = {
      locale,
      timeZone: D.isValidTimeZone(tz) ? tz : D.localTimeZone(),
      view: ['date', 'month', 'year'].includes(view) ? view : 'date',
      mode: S.MODES.includes(mode) ? mode : 'single-date',
      allowDeselect: flag('allow-deselect'),
      hideOutsideDays: flag('hide-outside-days'),
      weekStart: int('week-start', 0, 0, 6),
      alignment: a('alignment') === 'fixed' ? 'fixed' : 'natural',
      startColumn: int('start-column', 0, 0, 6),
      initialDate: D.parseISODate(a('initial-date')),
      today: D.parseISODate(a('today')),
      monthsToShow: int('months-to-show', 1, 1, 12),
      breakpoint: int('breakpoint', 640, 0, 1e7),
      listInitialMonths: int('list-initial-months', 4, 1, 1200),
      listMaxMonths: int('list-max-months', 24, 1, 1200),
      listMaxPrevMonths: int('list-max-prev-months', 12, 0, 1200),
      loadPrevStep: int('load-prev-step', 1, 1, 120),
      loadNextStep: int('load-next-step', 3, 1, 120),
      loadPrevLabel: a('load-prev-label') || t.loadPrev,
      loadNextLabel: a('load-next-label') || t.loadNext,
      listMaxHeight: int('list-max-height', 0, 0, 1e5),
      virtualWindowMonths: int('virtual-window-months', 9, 3, 240),
      monthBlockHeight: int('month-block-height', 0, 0, 5000),
      hoverPreview: a('hover-preview') !== 'false',
      autoLoad: flag('auto-load'),
      min: D.parseISODate(a('min')),
      max: D.parseISODate(a('max'))
    };
    c.listInitialMonths = Math.min(c.listInitialMonths, c.listMaxMonths);
    this.cfg = c;
    this._t = t;
    this._f = formatters(locale);
  }

  _applyConfigChange() {
    const prev = this.cfg;
    this._readConfig();
    const c = this.cfg;
    if (prev.mode !== c.mode) { this._sel = S.emptySelection(); this._emitChange(); }
    if (RESET_KEYS.some(k => prev[k] !== c[k])) this._reset(false);
    else this._render();
  }

  _selectionFromAttr(text) { return S.selectionFromValue(this.cfg.mode, parseValueText(text)); }

  _reset(clearSelection) {
    const c = this.cfg;
    this._today = c.today ?? D.todayInZone(c.timeZone);
    const start = c.initialDate ?? this._today;
    this._viewSerial = D.serialOfDay(start);
    this._view = c.view;
    this._pickerYear = D.serialYear(this._viewSerial);
    this._yearStart = this._pickerYear;
    this._listAnchor = this._viewSerial;
    this._prevLoaded = 0;
    this._futureCount = c.listInitialMonths;
    this._focusDay = start;
    this._hover = null;
    if (clearSelection) this._sel = S.emptySelection();
    this._render();
  }

  // ---------- Layout ----------

  _width() {
    return this.getBoundingClientRect().width || this.parentElement?.getBoundingClientRect().width || window.innerWidth;
  }

  _onResize() {
    if (!this._connected) return;
    const w = this._width();
    if (w === this._lastWidth) return;
    this._lastWidth = w;
    const layout = w < this.cfg.breakpoint ? 'list' : 'grid';
    if (layout !== this._layout) this._render();
  }

  _render() {
    if (!this.cfg.today) this._today = D.todayInZone(this.cfg.timeZone);
    this._lastWidth = this._width();
    this._layout = this._lastWidth < this.cfg.breakpoint ? 'list' : 'grid';
    const view = this._layout === 'list' ? 'date' : this._view;
    this._root.className = `vc-root vc-layout-${this._layout} vc-view-${view}`;
    if (this._layout === 'list') this._renderList(); else this._renderGrid();
    this._emit('vc-view-change', { layout: this._layout, view, month: D.toISODate(D.firstDayOfSerial(this._viewSerial)) });
  }

  _dayHTML(n, d) {
    const c = this.cfg;
    const dis = (c.min !== null && n < c.min) || (c.max !== null && n > c.max);
    return `<button type="button" class="vc-day" data-day="${n}" tabindex="-1"${dis ? ' disabled' : ''} aria-label="${this._f.dayLabel(n)}"><span class="vc-num">${d}</span></button>`;
  }

  _weekdaysHTML(serial, natural) {
    const c = this.cfg;
    const cols = D.columnWeekdays(serial, { weekStart: c.weekStart, alignment: natural ? 'natural' : c.alignment, startColumn: c.startColumn });
    return cols.map(w => `<span>${this._f.weekday(w)}</span>`).join('');
  }

  // ---------- Modo grade ----------

  _renderGrid() {
    this._teardownList();
    const focusedAct = this._root.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    const html = this._view === 'date' ? this._panelsHTML() : this._pickerHTML();
    this._root.innerHTML = html;
    this._cells = [...this._root.querySelectorAll('button.vc-day')];
    this._paint();
    if (focusedAct) this._root.querySelector(`[data-act="${focusedAct}"]`)?.focus();
  }

  _panelsHTML() {
    const c = this.cfg, n = c.monthsToShow;
    const showOutside = n === 1 && !c.hideOutsideDays;
    let html = '<div class="vc-panels">';
    for (let i = 0; i < n; i++) html += this._panelHTML(this._viewSerial + i, i === 0, i === n - 1, showOutside);
    return html + '</div>';
  }

  _panelHTML(serial, first, last, showOutside) {
    const c = this.cfg, t = this._t, f = this._f;
    const L = D.monthLayout(serial, { weekStart: c.weekStart, alignment: c.alignment, startColumn: c.startColumn });
    const title = f.monthTitle(serial);
    let html = `<section class="vc-panel" data-serial="${serial}"><div class="vc-head">`
      + (first ? `<button type="button" class="vc-nav prev" data-act="prev" aria-label="${t.prev}">${ICON_PREV}</button>` : '<span></span>')
      + `<button type="button" class="vc-title" data-act="title" data-serial="${serial}" aria-label="${esc(title)}. ${t.chooseMonth}">${esc(title)}</button>`
      + (last ? `<button type="button" class="vc-nav next" data-act="next" aria-label="${t.next}">${ICON_NEXT}</button>` : '<span></span>')
      + `</div><div class="vc-weekdays" aria-hidden="true">${this._weekdaysHTML(serial, false)}</div>`
      + `<div class="vc-days" role="group" aria-label="${esc(title)}">`;
    for (let i = 0; i < 42; i++) {
      const n = L.first - L.offset + i;
      if (i >= L.offset && i < L.offset + L.days) html += this._dayHTML(n, i - L.offset + 1);
      else if (showOutside) html += `<span class="vc-day out" aria-hidden="true"><span class="vc-num">${D.fromDayNumber(n).d}</span></span>`;
      else html += '<span class="vc-day vc-empty"></span>';
    }
    return html + '</div></section>';
  }

  _pickerHTML() {
    const t = this._t, f = this._f;
    const todaySerial = D.serialOfDay(this._today);
    let title, label, items = '';
    if (this._view === 'month') {
      const y = this._pickerYear;
      title = String(y); label = `${title}. ${t.chooseYear}`;
      for (let m = 0; m < 12; m++) {
        const s = D.monthSerial(y, m);
        const cls = (s === todaySerial ? ' current' : '') + (s === this._viewSerial ? ' active' : '');
        items += `<button type="button" class="vc-pick${cls}" data-act="pick-month" data-serial="${s}" aria-label="${esc(f.monthTitle(s))}">${f.monthShort(m)}</button>`;
      }
    } else {
      const y0 = this._yearStart;
      title = `${y0} – ${y0 + 11}`; label = `${title}. ${t.backToDays}`;
      for (let y = y0; y < y0 + 12; y++) {
        const cls = (y === D.serialYear(todaySerial) ? ' current' : '') + (y === this._pickerYear ? ' active' : '');
        items += `<button type="button" class="vc-pick${cls}" data-act="pick-year" data-year="${y}">${y}</button>`;
      }
    }
    return `<section class="vc-panel"><div class="vc-head">`
      + `<button type="button" class="vc-nav prev" data-act="prev" aria-label="${t.prev}">${ICON_PREV}</button>`
      + `<button type="button" class="vc-title" data-act="title" aria-label="${esc(label)}">${esc(title)}</button>`
      + `<button type="button" class="vc-nav next" data-act="next" aria-label="${t.next}">${ICON_NEXT}</button>`
      + `</div><div class="vc-picker" role="group" aria-label="${esc(title)}">${items}</div></section>`;
  }

  _step(dir) {
    if (this._layout === 'list') { if (dir > 0) this.loadNext(); else this.loadPrevious(); return; }
    if (this._view === 'date') this._viewSerial += dir;
    else if (this._view === 'month') this._pickerYear += dir;
    else this._yearStart += 12 * dir;
    this._render();
  }

  _cycleView(serial) {
    if (this._view === 'date') { this._pickerYear = D.serialYear(Number.isFinite(serial) ? serial : this._viewSerial); this._view = 'month'; }
    else if (this._view === 'month') { this._yearStart = this._pickerYear; this._view = 'year'; }
    else this._view = 'date';
    this._render();
  }

  // ---------- Modo lista virtual ----------

  _renderList() {
    const c = this.cfg;
    const inner = c.listMaxHeight > 0;
    this._teardownList();
    this._root.innerHTML = `<div class="vc-list${inner ? ' inner' : ''}"${inner ? ` style="max-height:${c.listMaxHeight}px"` : ''}>`
      + `<div class="vc-weekdays" aria-hidden="true">${this._weekdaysHTML(this._listAnchor, true)}</div>`
      + `<button type="button" class="vc-load prev" data-act="load-prev">${esc(c.loadPrevLabel)}</button>`
      + '<div class="vc-body"></div>'
      + `<button type="button" class="vc-load next" data-act="load-next">${esc(c.loadNextLabel)}</button></div>`;
    this._list = this._root.firstElementChild;
    this._body = this._list.querySelector('.vc-body');
    this._loadPrevBtn = this._list.querySelector('.vc-load.prev');
    this._loadNextBtn = this._list.querySelector('.vc-load.next');
    this._cells = [];
    this._measure();
    this._attachScroll(inner ? this._list : window);
    this._relayoutList();
    if (c.autoLoad && 'IntersectionObserver' in window) {
      this._io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) this._autoLoad();
      }, { root: inner ? this._list : null, rootMargin: '0px 0px 600px 0px' });
      this._io.observe(this._loadNextBtn);
    }
  }

  _autoLoad() {
    if (!this.loadNext()) return;
    // Se o botão continua perto da tela, carrega de novo no próximo quadro.
    requestAnimationFrame(() => {
      if (!this._loadNextBtn || this._loadNextBtn.hidden) return;
      const r = this._loadNextBtn.getBoundingClientRect();
      const bottom = this._scrollEl === window ? window.innerHeight : this._list.getBoundingClientRect().bottom;
      if (r.top < bottom + 600) this._autoLoad();
    });
  }

  _teardownList() {
    this._detachScroll();
    this._io?.disconnect();
    this._io = null;
    this._blocks.clear();
    this._list = this._body = this._loadPrevBtn = this._loadNextBtn = null;
    this._count = 0;
  }

  _attachScroll(el) {
    this._detachScroll();
    this._scrollEl = el;
    el.addEventListener('scroll', this._onScroll, { passive: true });
  }

  _detachScroll() {
    this._scrollEl?.removeEventListener('scroll', this._onScroll);
    this._scrollEl = null;
  }

  // Mede título, linha e espaço entre meses com o CSS real.
  _measure() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:0;right:0;top:0;visibility:hidden';
    probe.innerHTML = '<div class="vc-month-title">0</div><div class="vc-days"><span class="vc-day"></span></div><div style="height:var(--vc-month-gap)"></div>';
    this._body.appendChild(probe);
    const [title, row, gap] = probe.children;
    this._titleH = title.offsetHeight || 56;
    this._rowH = row.offsetHeight || 40;
    this._gapH = gap.offsetHeight;
    probe.remove();
    this._headerH = this._list.querySelector('.vc-weekdays').offsetHeight;
  }

  _blockHeight(serial) {
    if (this.cfg.monthBlockHeight > 0) return this.cfg.monthBlockHeight;
    const L = D.monthLayout(serial, { weekStart: this.cfg.weekStart });
    return this._titleH + L.rows * this._rowH + this._gapH;
  }

  _relayoutList() {
    if (!this._body) return;
    const c = this.cfg;
    this._listStart = this._listAnchor - this._prevLoaded;
    const count = this._prevLoaded + this._futureCount;
    const off = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) off[i + 1] = off[i] + this._blockHeight(this._listStart + i);
    this._offsets = off;
    this._count = count;
    this._body.style.height = `${off[count]}px`;
    this._loadPrevBtn.hidden = this._prevLoaded >= c.listMaxPrevMonths;
    this._loadNextBtn.hidden = this._futureCount >= c.listMaxMonths;
    for (const [s, el] of this._blocks) {
      const i = s - this._listStart;
      if (i < 0 || i >= count) { el.remove(); this._blocks.delete(s); } else el.style.top = `${off[i]}px`;
    }
    this._updateWindow(true);
    this._emit('vc-list-change', this._listStatus());
  }

  _listStatus() {
    return {
      available: this._futureCount, previous: this._prevLoaded, total: this._count,
      window: this.cfg.virtualWindowMonths, rendered: this._blocks.size, virtual: this._count > this.cfg.virtualWindowMonths,
      first: this._count ? D.toISODate(D.firstDayOfSerial(this._listStart)) : null,
      last: this._count ? D.toISODate(D.firstDayOfSerial(this._listStart + this._count - 1)) : null
    };
  }

  // Trecho visível, em pixels a partir do topo da lista de meses.
  _viewRange() {
    const r = this._body.getBoundingClientRect();
    if (this._scrollEl === window) return [-r.top, window.innerHeight - r.top];
    const s = this._list.getBoundingClientRect();
    return [s.top - r.top, s.bottom - r.top];
  }

  _indexAt(y) {
    const off = this._offsets;
    let lo = 0, hi = this._count - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (off[mid] <= y) lo = mid; else hi = mid - 1; }
    return lo;
  }

  _updateWindow(force) {
    if (!this._body || !this._count) return;
    const W = this.cfg.virtualWindowMonths;
    let a = 0, b = this._count - 1;
    if (this._count > W) {
      const [y0, y1] = this._viewRange();
      const v0 = this._indexAt(y0), v1 = this._indexAt(y1);
      const extra = Math.max(1, Math.floor((W - (v1 - v0 + 1)) / 2));
      a = Math.max(0, v0 - extra);
      b = Math.min(this._count - 1, v1 + extra);
    }
    if (!force && a === this._wa && b === this._wb) return;
    this._wa = a; this._wb = b;
    for (const [s, el] of this._blocks) {
      const i = s - this._listStart;
      if (i < a || i > b) { el.remove(); this._blocks.delete(s); }
    }
    let next = null;
    for (let i = b; i >= a; i--) {
      const s = this._listStart + i;
      let el = this._blocks.get(s);
      if (!el) {
        el = this._createBlock(s, this._offsets[i]);
        this._body.insertBefore(el, next);
        this._blocks.set(s, el);
        this._paintCells(el._cells);
      }
      next = el;
    }
    this._fixTabStop();
  }

  _createBlock(serial, top) {
    const c = this.cfg, f = this._f;
    const L = D.monthLayout(serial, { weekStart: c.weekStart });
    const el = document.createElement('section');
    el.className = 'vc-month';
    el.style.top = `${top}px`;
    if (c.monthBlockHeight > 0) el.style.height = `${c.monthBlockHeight}px`;
    el.dataset.serial = serial;
    let html = `<div class="vc-month-title">${f.listTitle(serial)}</div><div class="vc-days" role="group" aria-label="${esc(f.monthTitle(serial))}">`;
    for (let i = 0; i < L.offset; i++) html += '<span class="vc-day vc-empty"></span>';
    for (let d = 1; d <= L.days; d++) html += this._dayHTML(L.first + d - 1, d);
    el.innerHTML = html + '</div>';
    el._cells = [...el.querySelectorAll('button.vc-day')];
    return el;
  }

  _scrollToIndex(i) {
    if (!this._body) return;
    const r = this._body.getBoundingClientRect();
    const y = this._offsets[i] - this._headerH;
    if (this._scrollEl === window) {
      const sticky = parseFloat(getComputedStyle(this).getPropertyValue('--vc-sticky-top')) || 0;
      window.scrollTo({ top: window.scrollY + r.top + y - sticky, behavior: 'instant' });
    } else {
      this._list.scrollTop += r.top + y - this._list.getBoundingClientRect().top;
    }
    this._updateWindow(true);
  }

  // ---------- Pintura da seleção ----------

  _previewHover() {
    return this.cfg.hoverPreview && S.isRangeMode(this.cfg.mode) && this._sel.anchor !== null ? this._hover : null;
  }

  _paint() {
    if (this._layout === 'list') for (const el of this._blocks.values()) this._paintCells(el._cells);
    else this._paintCells(this._cells);
    this._fixTabStop();
  }

  _paintCells(cells) {
    const sel = this._sel, hover = this._previewHover(), today = this._today;
    for (const el of cells) {
      const n = el._n ?? (el._n = +el.dataset.day);
      const v = S.dayVisual(n, sel, hover);
      let cls = 'vc-day';
      if (v.band) cls += ` ${v.band}`;
      if (v.circle) cls += ` ${v.circle}`;
      if (n === today) cls += ' today';
      if (el.disabled) cls += ' dis';
      if (el.className !== cls) el.className = cls;
      const base = hover === null ? v : S.dayVisual(n, sel, null);
      const pressed = base.circle === 'sel' || base.band !== '';
      if (el._p !== pressed) { el.setAttribute('aria-pressed', pressed ? 'true' : 'false'); el._p = pressed; }
    }
  }

  // Só um dia recebe Tab (tabindex 0): o dia em foco, ou o primeiro dia visível.
  _fixTabStop() {
    const want = this._root.querySelector(`button.vc-day[data-day="${this._focusDay}"]:not(:disabled)`)
      || this._root.querySelector('button.vc-day:not(:disabled)');
    if (this._tabStop === want) return;
    if (this._tabStop) this._tabStop.tabIndex = -1;
    if (want) want.tabIndex = 0;
    this._tabStop = want;
  }

  // ---------- Eventos ----------

  _dayOf(target) {
    const b = target.closest?.('button.vc-day');
    return b && !b.disabled ? +b.dataset.day : null;
  }

  _setHover(n) {
    if (n === this._hover) return;
    const before = this._previewHover();
    this._hover = n;
    if (before !== this._previewHover()) this._paint();
  }

  _onClick(e) {
    const btn = e.target.closest('button');
    if (!btn || !this._root.contains(btn) || btn.disabled) return;
    if (btn.classList.contains('vc-day')) {
      const n = +btn.dataset.day;
      this._focusDay = n;
      this._setSelection(S.applyClick(this._sel, n, this.cfg.mode, this.cfg.allowDeselect), true);
      return;
    }
    switch (btn.dataset.act) {
      case 'prev': this._step(-1); break;
      case 'next': this._step(1); break;
      case 'title': this._cycleView(+btn.dataset.serial); break;
      case 'pick-month': this._viewSerial = +btn.dataset.serial; this._view = 'date'; this._render(); break;
      case 'pick-year': this._pickerYear = +btn.dataset.year; this._view = 'month'; this._render(); break;
      case 'load-prev': this.loadPrevious(); break;
      case 'load-next': this.loadNext(); break;
    }
  }

  _onKeyDown(e) {
    const btn = e.target.closest?.('button.vc-day');
    if (!btn) return;
    const n = +btn.dataset.day;
    const c = this.cfg;
    const col = () => {
      const s = D.serialOfDay(n);
      const L = D.monthLayout(s, { weekStart: c.weekStart, alignment: this._layout === 'list' ? 'natural' : c.alignment, startColumn: c.startColumn });
      return (L.offset + (n - L.first)) % 7;
    };
    let t;
    switch (e.key) {
      case 'ArrowLeft': t = n - 1; break;
      case 'ArrowRight': t = n + 1; break;
      case 'ArrowUp': t = n - 7; break;
      case 'ArrowDown': t = n + 7; break;
      case 'Home': t = n - col(); break;
      case 'End': t = n + 6 - col(); break;
      case 'PageUp': t = addMonths(n, e.shiftKey ? -12 : -1); break;
      case 'PageDown': t = addMonths(n, e.shiftKey ? 12 : 1); break;
      default: return;
    }
    e.preventDefault();
    if (c.min !== null) t = Math.max(t, c.min);
    if (c.max !== null) t = Math.min(t, c.max);
    this._focusDate(t);
  }

  _focusDate(n) {
    this._focusDay = n;
    const s = D.serialOfDay(n);
    if (this._layout === 'grid') {
      if (this._view !== 'date') { this._view = 'date'; this._viewSerial = s; this._render(); }
      else if (s < this._viewSerial) { this._viewSerial = s; this._render(); }
      else if (s >= this._viewSerial + this.cfg.monthsToShow) { this._viewSerial = s - this.cfg.monthsToShow + 1; this._render(); }
      else this._fixTabStop();
    } else {
      const i = s - this._listStart;
      if (i < 0 || i >= this._count) return;
      if (!this._blocks.has(s)) this._scrollToIndex(i);
      this._fixTabStop();
    }
    const el = this._root.querySelector(`button.vc-day[data-day="${n}"]`);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
  }

  _setSelection(sel, emit) {
    this._sel = sel;
    this._paint();
    if (emit) this._emitChange();
  }

  _emitChange() {
    const detail = { ...this.selection, value: this.value };
    this._emit('vc-change', detail);
    this.dispatchEvent(new Event('change', { bubbles: true }));
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

if (!customElements.get('virtual-calendar')) customElements.define('virtual-calendar', VirtualCalendar);
