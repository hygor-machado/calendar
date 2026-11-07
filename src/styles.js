// CSS do componente. Injetado uma vez no <head>. Todas as cores e medidas são
// variáveis --vc-*, que podem ser trocadas no elemento ou num ancestral.
export const CSS = `
.vc{
  --vc-font: inherit;
  --vc-text: rgb(26,26,26);
  --vc-muted: rgb(82,82,82);
  --vc-bg: #fff;
  --vc-border: rgb(230,230,230);
  --vc-accent: rgb(98,93,254);
  --vc-accent-contrast: #fff;
  --vc-range: rgb(233,235,251);
  --vc-hover: rgb(233,235,251);
  --vc-hover-text: rgb(64,31,193);
  --vc-pressed: rgba(216,219,249,.85);
  --vc-today: rgb(5,178,209);
  --vc-load-bg: rgb(233,235,251);
  --vc-load-text: rgb(64,31,193);
  --vc-focus: rgb(98,93,254);
  --vc-row-height: 40px;
  --vc-day-size: 36px;
  --vc-font-size: 13px;
  --vc-title-height: 56px;
  --vc-month-gap: 24px;
  --vc-sticky-top: 0px;
  display:block;
  font-family:var(--vc-font);
  color:var(--vc-text);
  font-size:var(--vc-font-size);
  line-height:1.3;
  -webkit-text-size-adjust:100%;
}
.vc *,.vc *::before,.vc *::after{box-sizing:border-box}
.vc button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent;text-align:center;letter-spacing:inherit}
.vc button:disabled{cursor:default}
.vc button:focus{outline:none}
.vc button:focus-visible{outline:2px solid var(--vc-focus);outline-offset:2px;border-radius:8px}

/* Grade de dias */
.vc-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.vc-weekdays{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));color:var(--vc-muted);text-transform:lowercase;font-size:var(--vc-font-size)}
.vc-weekdays>span{display:flex;align-items:center;justify-content:center;height:var(--vc-row-height);overflow:hidden;white-space:nowrap}
.vc-day{position:relative;height:var(--vc-row-height);display:flex;align-items:center;justify-content:center;min-width:0}
.vc-day::before{content:"";position:absolute;top:calc((var(--vc-row-height) - var(--vc-day-size)) / 2);height:var(--vc-day-size);left:0;right:0;background:var(--vc-range);visibility:hidden}
.vc-day.b-f::before{visibility:visible}
.vc-day.b-r::before{visibility:visible;left:50%}
.vc-day.b-l::before{visibility:visible;right:50%}
.vc-num{position:relative;width:var(--vc-day-size);height:var(--vc-day-size);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:500;font-variant-numeric:tabular-nums}
.vc button.vc-day:focus-visible{outline:none}
.vc button.vc-day:focus-visible .vc-num{outline:2px solid var(--vc-focus);outline-offset:1px}
.vc-day.today .vc-num{color:var(--vc-today)}
@media (hover:hover){.vc button.vc-day:hover .vc-num{background:var(--vc-hover);color:var(--vc-hover-text)}}
.vc button.vc-day:active .vc-num{background:var(--vc-pressed)}
.vc .vc-day.ring .vc-num{background:transparent;box-shadow:inset 0 0 0 2px var(--vc-accent);color:var(--vc-accent)}
.vc .vc-day.sel .vc-num{background:var(--vc-accent);color:var(--vc-accent-contrast);box-shadow:none}
.vc-day.out{opacity:.4;pointer-events:none}
.vc-day.dis{cursor:default}
.vc-day.dis .vc-num{color:var(--vc-muted);opacity:.45;text-decoration:line-through}
.vc-empty{pointer-events:none}

/* Modo grade (um ou mais meses lado a lado) */
.vc-panels{display:flex;flex-wrap:wrap;gap:24px 32px}
.vc-panel{flex:1 1 252px;min-width:0}
.vc-head{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;height:40px;margin-bottom:4px}
.vc-nav{width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:var(--vc-text)}
.vc-nav svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
@media (hover:hover){.vc-nav:hover{background:var(--vc-hover);color:var(--vc-hover-text)}}
.vc-nav.next{justify-self:end}
.vc .vc-title{justify-self:center;font-weight:600;height:36px;padding:0 16px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
@media (hover:hover){.vc-title:hover{background:var(--vc-hover);color:var(--vc-hover-text)}}
.vc-view-month .vc-title,.vc-view-year .vc-title{background:var(--vc-hover);color:var(--vc-hover-text)}

/* Visões de mês e ano */
.vc-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 4px;padding:8px 0}
.vc .vc-pick{justify-self:center;width:100%;max-width:104px;height:44px;border-radius:22px;font-weight:500}
@media (hover:hover){.vc-pick:hover{background:var(--vc-hover);color:var(--vc-hover-text)}}
.vc-pick:active{background:var(--vc-pressed)}
.vc-pick.current{color:var(--vc-today)}
.vc .vc-pick.active{background:var(--vc-accent);color:var(--vc-accent-contrast)}

/* Modo lista virtual */
.vc-list{position:relative;overflow-anchor:none}
.vc-list.inner{overflow-y:auto;overscroll-behavior:contain}
.vc-list .vc-weekdays{position:sticky;top:var(--vc-sticky-top);z-index:2;background:var(--vc-bg);border-bottom:1px solid var(--vc-border)}
.vc-list.inner .vc-weekdays{top:0}
.vc .vc-load{display:block;width:100%;height:40px;margin:8px 0;border-radius:8px;background:var(--vc-load-bg);color:var(--vc-load-text);font-weight:500}
.vc .vc-load[hidden]{display:none}
.vc .vc-load:disabled{opacity:.6}
.vc-body{position:relative;overflow-anchor:none}
.vc-month{position:absolute;left:0;right:0;contain:layout style}
.vc-month-title{height:var(--vc-title-height);display:flex;align-items:center;font-weight:600}
.vc-list .vc-day{scroll-margin-top:calc(var(--vc-row-height) + var(--vc-sticky-top) + 8px);scroll-margin-bottom:8px}
`;

let injected = false;
export function injectStyles(doc = document) {
  if (injected || doc.getElementById('vc-styles')) { injected = true; return; }
  const style = doc.createElement('style');
  style.id = 'vc-styles';
  style.textContent = CSS;
  doc.head.appendChild(style);
  injected = true;
}
