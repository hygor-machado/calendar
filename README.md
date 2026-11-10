# Calendário virtual

Calendário em JavaScript puro, sem dependências, empacotado como Web Component (`<virtual-calendar>`).
É a versão em código do reusable **Calendar Virtual** do app Bubble `native-calendar-backup-copy`:
mesmos parâmetros, mesmos modos de seleção, mesma lista com carga progressiva e janela virtual.

**Demonstração:** https://calendar.engajus.workers.dev/ (Cloudflare Workers).

## Recursos

- **Quatro modos de seleção:** data única, intervalo único, várias datas e vários intervalos
  (intervalos que se encostam ou se sobrepõem viram um só). Opção de permitir desmarcar.
- **Prévia do intervalo:** depois de escolher o início, o intervalo aparece ao passar o mouse, ao focar pelo
  teclado e, no celular, assim que o dedo toca o dia. Pode ser desligada.
- **Dois layouts, escolhidos pela largura (`breakpoint`):**
  - **Grade:** 1 a 12 meses lado a lado, setas de mês anterior e próximo, e visões de **dia, mês e ano**
    (clique no título para trocar; escolher um ano abre os meses, escolher um mês abre os dias).
  - **Lista virtual:** meses empilhados com cabeçalho de dias da semana fixo, botões para carregar meses
    anteriores e próximos, limites de quantidade, e janela virtual: só os meses perto da tela ficam no DOM.
    Rola a página inteira ou uma área com altura própria.
- **Fuso horário (IANA):** "hoje" é calculado no fuso escolhido, e cada data sai em três formas:
  `date` (`2026-11-10`), `utc` (meia-noite UTC) e `tz` (meia-noite no fuso), como as saídas
  `SelectedUTCDate` / `SelectedDateTZ` / `RangeStartUTC` etc. do Bubble.
- **Grade configurável:** primeiro dia da semana, alinhamento natural ou fixo (dia 1 sempre na mesma coluna),
  dias de fora do mês a 40% ou ocultos, data inicial, "hoje" simulado, datas mínima e máxima.
- **Idiomas:** nomes de meses e dias pelo `Intl` (qualquer locale); textos dos botões em inglês, português e espanhol.
- **Acessível:** botões reais, rótulos com a data completa, `aria-pressed`, foco visível e teclado
  (setas, Home/End, PageUp/PageDown, Shift+Page para ano, Enter/Espaço para escolher).
- **Tema:** todas as cores e medidas são variáveis CSS (`--vc-*`); a demonstração tem tema escuro.

## Desempenho

Medido com o benchmark oficial dos calendários (pasta [`benchmark/`](benchmark/), versão `code`):
viewport 390 × 844, 22 meses carregados, mediana de 3 rodadas.

| Métrica | Bubble v5 | Código |
|---|---:|---:|
| Clique até o texto da seleção mudar | 80 ms | 3,7 ms |
| Long tasks no cenário com clique | 106 ms | 0 ms |
| Long tasks na rolagem com roda do mouse | 87 ms | 0 ms |
| Maior intervalo entre quadros na rolagem | 133 ms | 17 ms |
| Elementos do calendário no DOM | 7.698 | 340 |

No celular emulado com CPU 4× mais lenta, o toque num dia leva cerca de 20 ms até o quadro pintado
(Bubble v5 com prévia ligada: 344 ms).

## Uso

```html
<script type="module" src="https://calendar.engajus.workers.dev/src/virtual-calendar.js"></script>

<virtual-calendar
  selection-mode="single-range"
  locale="pt-BR"
  timezone="America/Sao_Paulo"
  months-to-show="2"
  breakpoint="640"
  allow-deselect>
</virtual-calendar>

<script type="module">
  const cal = document.querySelector('virtual-calendar');
  cal.addEventListener('vc-change', e => {
    console.log(e.detail.value);      // { start: '2026-11-10', end: '2026-11-15' }
    console.log(e.detail.start.tz);   // '2026-11-10T03:00:00.000Z'
  });
</script>
```

### Dentro do Bubble

Num elemento **HTML** da página:

```html
<script type="module" src="https://calendar.engajus.workers.dev/src/virtual-calendar.js"></script>
<virtual-calendar id="cal" selection-mode="single-range" locale="pt-BR" timezone="America/Sao_Paulo" allow-deselect></virtual-calendar>
<script>
  document.getElementById('cal').addEventListener('vc-change', function (e) {
    // Plugin Toolbox: elemento "JavaScript to Bubble" com o sufixo cal_value e valor do tipo texto.
    if (window.bubble_fn_cal_value) window.bubble_fn_cal_value(JSON.stringify(e.detail.value));
  });
</script>
```

Para levar dados do Bubble para o calendário, use expressões dinâmicas nos atributos
(por exemplo `value="2026-11-10/2026-11-15"` ou `initial-date="..."`).

## Atributos

| Atributo | Padrão | Equivalente no Bubble |
|---|---|---|
| `selection-mode` | `single-date` | SelectionMode: `single-date`, `single-range`, `multiple-dates`, `multiple-ranges` |
| `allow-deselect` | desligado | Permitir desmarcar a seleção |
| `view` | `date` | ViewType inicial: `date`, `month`, `year` (só no modo grade) |
| `locale` | `en-US` | Idioma |
| `timezone` | fuso do navegador | TimezoneID |
| `week-start` | `0` | WeekStartOn (0 = domingo) |
| `alignment` | `natural` | AlignmentMode: `natural` ou `fixed` |
| `start-column` | `0` | Coluna do dia 1 no modo `fixed` (0 a 6) |
| `initial-date` | hoje | Data inicial (`AAAA-MM-DD`) |
| `today` | hoje no fuso | Hoje simulado |
| `months-to-show` | `1` | MonthsToShow (1 a 12, modo grade) |
| `breakpoint` | `640` | Largura em px abaixo da qual vira lista; `99999` força a lista, `0` força a grade |
| `hide-outside-days` | desligado | Oculta os dias de outros meses na grade de um mês |
| `list-initial-months` | `4` | ListInitialMonths |
| `list-max-months` | `24` | ListMaxMonths (mês inicial + futuros) |
| `list-max-prev-months` | `12` | ListMaxPrevMonths |
| `load-prev-step` | `1` | LoadPrevStep |
| `load-next-step` | `3` | LoadNextStep |
| `load-prev-label` | conforme o idioma | LoadPrevLabel |
| `load-next-label` | conforme o idioma | LoadNextLabel |
| `list-max-height` | `0` | ListMaxHeight: `0` rola a página; maior que 0 cria uma área com rolagem própria |
| `virtual-window-months` | `9` | VirtualWindowMonths: acima disso, só uma janela de meses fica no DOM |
| `month-block-height` | `0` | MonthBlockHeight: `0` calcula pela quantidade de semanas |
| `hover-preview` | `true` | HoverPreview (`false` desliga) |
| `auto-load` | desligado | Carrega os próximos meses sozinho ao chegar no fim da lista |
| `min`, `max` | sem limite | Datas fora do limite ficam desativadas |
| `value` | vazio | Seleção inicial: `2026-11-10`, `2026-11-10/2026-11-15`, ou vários separados por vírgula |

## Eventos

| Evento | `detail` |
|---|---|
| `vc-change` | `mode`, `value` e as datas em três formas (`date`, `utc`, `tz`): `date` (data única), `dates`, `start`/`end`/`complete` (intervalo único), `ranges`, e `pending` (início escolhido sem fim) |
| `vc-list-change` | `available`, `previous`, `total`, `window`, `rendered`, `virtual`, `first`, `last` |
| `vc-view-change` | `layout`, `view`, `month` |

O elemento também dispara `change` a cada seleção.

## Métodos e propriedades

| Nome | Uso |
|---|---|
| `value` | Lê ou define a seleção (`'2026-11-10'`, `{ start, end }`, lista de datas ou de `{ start, end }`) |
| `selection` | Seleção completa, com as três formas de cada data |
| `state` | Layout, visão, mês exibido e situação da lista |
| `goToDate('2027-03-01')` | Mostra o mês da data (na lista, rola até ele ou recomeça a lista ali) |
| `next()`, `prev()` | Próximo e anterior (na lista, carrega meses) |
| `setView('month')` | Troca a visão no modo grade |
| `loadNext()`, `loadPrevious()` | Carrega meses na lista |
| `clearSelection()` | Limpa a seleção |
| `reset()` | Volta à data inicial, limpa a seleção e reinicia a carga de meses |

## Variáveis CSS

`--vc-font`, `--vc-text`, `--vc-muted`, `--vc-bg`, `--vc-border`, `--vc-accent`, `--vc-accent-contrast`,
`--vc-range`, `--vc-hover`, `--vc-hover-text`, `--vc-pressed`, `--vc-today`, `--vc-load-bg`, `--vc-load-text`,
`--vc-focus`, `--vc-row-height`, `--vc-day-size`, `--vc-font-size`, `--vc-title-height`, `--vc-month-gap` e
`--vc-sticky-top` (distância do cabeçalho fixo da lista até o topo, para páginas com barra fixa).

## Desenvolvimento

Requer Node.js 22.23 ou mais novo (exigência do CLI `cf` do Cloudflare).

```bash
npm install
npx playwright install chromium
npm start            # http://127.0.0.1:8080/
npm test             # datas, fuso e seleção
npm run test:e2e     # navegador
npx cf dev           # mesmo site, servido pelo runtime do Cloudflare
```

Estrutura:

- `public/src/date-utils.js`: datas como números de dia, layout do mês e fuso horário.
- `public/src/selection.js`: regras de seleção, visual de cada dia e formatos de saída.
- `public/src/styles.js`: CSS do componente, injetado uma vez no `<head>`.
- `public/src/virtual-calendar.js`: o Web Component.
- `public/index.html` e `public/demo/`: página de demonstração, com o painel Settings do app Bubble.
- `cloudflare.config.ts` e `wrangler.config.ts`: Worker `calendar`, que serve só a pasta `public/`.
- `benchmark/`: benchmark oficial que compara as versões do calendário (Bubble e código); veja o README da pasta.

## Publicação (Cloudflare Workers)

O site é um Worker só de arquivos estáticos, publicado com o CLI [`cf`](https://developers.cloudflare.com/cf/).
O workflow `deploy.yml` roda a cada push na `main`: testa, monta com `cf build` e publica com `cf deploy`.

Para ele publicar, o repositório precisa do secret `CLOUDFLARE_API_TOKEN`
(Settings → Secrets and variables → Actions), com um token do Cloudflare criado pelo modelo
**Edit Cloudflare Workers**. Se o token tiver acesso a mais de uma conta, adicione também `CLOUDFLARE_ACCOUNT_ID`.
Sem o secret, o workflow só valida a publicação.

Para publicar da sua máquina: `npx cf auth login` e depois `npm run deploy`.
