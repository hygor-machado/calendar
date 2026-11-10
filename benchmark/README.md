# Benchmark oficial dos calendários virtuais (Bubble)

Teste de desempenho, só de leitura, dos calendários virtualizados do app Bubble `native-calendar-backup-copy`
(versão `version-test`). Abre cada página de teste num Chromium controlado pelo Playwright, carrega 22 meses
e mede quatro cenários de rolagem e clique. Não altera nada no editor Bubble, nem páginas, reusables ou dados.

Origem: protocolo escrito pelo ChatGPT para o confronto entre `ru: Calendar Virtual (ChatGPT)` e
`ru: Calendar Virtual (Claude)`. A lógica de preparo, cenários e coletores (`monitor.js`) foi mantida igual.
O que mudou para virar o teste oficial:

- as versões testadas ficam em `versions.json` (página + classes CSS de cada calendário);
- `--versions` escolhe quais rodar, em qualquer quantidade;
- `--rounds` define o número de rodadas (padrão 3);
- o `report.md` ganhou uma tabela lado a lado com as métricas principais.

`--versions chatgpt,claude` reproduz exatamente o protocolo original de duas versões.

## Executar

Requer Python 3.10 ou superior.

```bash
cd benchmark
python -m venv .venv && . .venv/bin/activate
python -m pip install -r requirements.txt
python -m playwright install chromium
python benchmark.py --output benchmark-results
```

Opções:

| Opção | Padrão | Uso |
|---|---|---|
| `--versions` | `default_versions` do `versions.json` | Ex.: `--versions claude_v3,chatgpt` |
| `--rounds` | 3 | Rodadas por versão |
| `--base-url` | `base_url` do `versions.json` | Outro app ou versão live |
| `--output` | `benchmark-results` | Pasta dos resultados (ignorada pelo git) |
| `--chromium` | Chromium do Playwright | Caminho de outro executável |
| `--headed` | headless | Navegador visível; não compare headless com visível |

Teste offline dos coletores (HTML sintético, não mede os calendários):

```bash
python self_test.py            # CHROMIUM=/caminho/do/chrome para usar outro executável
```

## Adicionar uma versão

Inclua uma entrada em `versions.json`:

```json
"minha_versao": {
  "page": "zz-minha-pagina",
  "reusable": "ru: Nome do reusable",
  "month": ".classe-do-bloco-do-mes",
  "title": ".classe-do-titulo-do-mes",
  "grid": ".classe-do-rg-de-dias",
  "day": ".classe-da-celula-do-dia"
}
```

A classe CSS de um elemento Bubble é o id dele com um `a` antes de cada letra maiúscula
(`bTPPz` → `.baTaPaPz`).

Uma versão fora do app Bubble usa `url` (endereço completo) no lugar de `page`, como a entrada `code`,
que aponta para a versão em código publicada no Cloudflare Workers.

A página de teste precisa ter, como as páginas `zz-virtual-*`:

- `#calendar-under-test` envolvendo o calendário;
- `#calendar-load-status` com o texto `N + P` (meses disponíveis + anteriores);
- o botão `Load next months`, que soma 3 meses por clique a partir de 4;
- `#selection-output`, que muda quando um dia é selecionado.

## Protocolo

- Viewport 390 × 844, timezone `America/Campo_Grande`, locale `en-US`, escala 1, sem toque, sem limitação de CPU ou rede.
- Cada execução abre um contexto novo do navegador. As rodadas giram a ordem das versões, de modo que cada
  versão passa por todas as posições (com duas versões: A,B / B,A / A,B).
- Preparo: espera 9 s após o `load`, confere 4 meses, clica 6 vezes em `Load next months` (2,5 s após cada clique),
  confere 22 meses pelo `#calendar-load-status`, volta ao topo e espera 2 s.
- Cenários, nesta ordem, voltando ao topo e esperando 2 s entre eles:
  - **A:** 75 × `mouse.wheel(0, 80)` e depois 75 × `mouse.wheel(0, -80)`, a cada 30 ms.
  - **B:** 36 × `scrollBy(60)`, um por `requestAnimationFrame`.
  - **C:** um `scrollBy(2400)` instantâneo.
  - **D:** repete A e clica num dia visível no meio do percurso (entre a descida e a subida), por coordenadas.
- Cada cenário tem 1 s de observação depois do último comando.

## Métricas

- **Long tasks:** `PerformanceObserver('longtask')` durante o cenário: quantidade, soma e maior duração.
- **Quadros:** intervalos de `requestAnimationFrame`; maior intervalo e quantos passaram de 50 ms.
- **Grade invisível:** quadros em que um mês na tela não tem dias desenhados (RG ausente, sem células com
  retângulo, ou opacidade acumulada abaixo de 0,5). Cada quadro conta uma vez.
- **Saltos de rolagem:** deslocamentos acima de 250 px que vão mais de 250 px além do destino pedido.
  O salto pedido do cenário C não conta como defeito.
- **Seleção (D):** tempo do clique real até o texto de `#selection-output` mudar, e até o rAF seguinte.
- **DOM final:** elementos do documento e de `#calendar-under-test`.

A mediana só é calculada quando todas as rodadas da versão são válidas para o cenário.

## Arquivos gerados

- `round_<r>_<versão>.json`: preparo, métricas e amostras brutas de cada execução.
- `all_rounds.json`: todas as execuções, incluindo falhas.
- `summary.json`: medianas por versão, cenário e métrica.
- `report.md`: tabela das métricas principais e tabela completa.
- `protocol.json` e `environment.json`: parâmetros, ordem, versões e navegador usados.

## Linha de base

- `baseline/2026-10-30.md`: primeira execução oficial (v3, v2 e ChatGPT).
- `baseline/2026-10-31-v4.md`: v4 × v3, com a curva de latência do clique por meses carregados.
- `baseline/2026-11-07-code.md`: versão em código (`<virtual-calendar>`) × v5.

## Limitações

- rAF não é um trace do compositor e pode não ver todos os quadros apresentados.
- A cadência de 30 ms é um alvo; os horários reais ficam no JSON.
- Os observers custam tempo; o custo é medido por quadro (`instrumentation_total_ms`).
- A detecção de salto é conservadora: pode não pegar um salto na mesma direção da rolagem pedida.
- A ordem fixa dos cenários pode aquecer os últimos; é a mesma para todas as versões.
- As métricas incluem os demais scripts da página.
