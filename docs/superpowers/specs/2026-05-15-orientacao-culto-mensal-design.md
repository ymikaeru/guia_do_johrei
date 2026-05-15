# Orientação do Culto Mensal — Design

**Data:** 2026-05-15
**Autor:** ymikaeru + Claude Opus 4.7
**Status:** Aprovado (pendente implementação)

## Contexto

Adicionar acesso à mensagem doutrinária do Culto Mensal (palavras do Reverendo + citações de Meishu-Sama) ao site Johrei : Guia para Ministrantes. O conteúdo muda mensalmente, é longo (~7 mil palavras) e precisa ser legível na tela e imprimível em papel para leitura offline.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| 1 | Localização do ponto de entrada | Ícone envelope no header superior (4º ícone, após Mapa) |
| 2 | Indicador de novidade | Badge tipo notificação ("1" em círculo vermelho) |
| 3 | Lógica do badge | Aparece quando há conteúdo não lido; some no primeiro clique; reaparece quando o mês muda |
| 4 | Storage do conteúdo | Arquivo único `data/culto_mensal_atual.md`, sobrescrito a cada mês (sem histórico) |
| 5 | Detecção de "mudou de mês" | Primeira linha do MD usada como chave de versão (`localStorage['cultoMensalLastSeen']`) |
| 6 | Visualização | Modal full-screen dedicado (não reusa `readModal`) |
| 7 | Impressão | Botão "Imprimir" no header do modal → `window.print()` + CSS `@media print` |

## Arquitetura

```
data/culto_mensal_atual.md   (fonte única, editado manualmente a cada mês)
        │
        ▼
js/culto-mensal.js
  ├── init()             ── ao DOMContentLoaded, faz HEAD/GET, extrai 1ª linha
  ├── checkBadgeStatus() ── compara com localStorage, mostra/esconde badge
  ├── openModal()        ── render do MD parseado, marca como lido
  ├── parseContent()     ── MD → HTML (parágrafos + blockquotes p/ citações)
  └── print()            ── window.print() com print stylesheet ativa
        │
        ▼
#cultoMensalModal (DOM)
  ├── header (título, salmo, [Aa] [Imprimir] [Fechar])
  └── #cultoMensalContent (corpo scrollável)
```

## Componentes

### 1. Botão no header (`index.html` linha ~125)

```html
<button onclick="openCultoMensal()" id="btnCultoMensal"
        class="relative flex items-center justify-center w-8 h-8 rounded-full ...">
  <svg><!-- envelope icon, heroicons-style --></svg>
  <span id="cultoMensalBadge" class="hidden absolute -top-0.5 -right-0.5
        bg-red-500 text-white text-[9px] font-bold w-3.5 h-3.5
        rounded-full flex items-center justify-center">1</span>
</button>
```

Posição: imediatamente após `#btnSiteMapa`. Cor do ícone: cinza neutro (`text-gray-400`), igual aos outros do header.

### 2. Modal (`index.html`, antes do `</body>`)

Estrutura full-screen com:
- Backdrop semi-opaco (`bg-white/95 dark:bg-black/95`)
- Card centralizado (full no mobile, `max-w-3xl` no desktop, `max-h-[90vh]`)
- Header sticky com título extraído da 1ª linha + salmo da 2ª linha + 3 botões
- Corpo scrollável com tipografia serif e padding generoso
- Respeita variáveis CSS de tema (`var(--n-bg)`, `var(--n-fg)`, etc.)

### 3. Parser de conteúdo (`js/culto-mensal.js`)

Markdown do anexo é simples — sem `#`, sem `>`, só parágrafos separados por linha em branco. Parser:

1. `split('\n\n')` para obter blocos
2. Para cada bloco:
   - Se começa com `"` ou `"` → `<blockquote class="cm-quote">`
   - Se começa com `Meishu Sama diz:` ou `Meishu-Sama expressou`, etc. → `<p class="cm-attribution">`
   - Caso contrário → `<p>`
3. Preservar acentuação e itálicos inline (`*texto*` → `<em>`)

A 1ª e 2ª linha são tratadas separadamente como `title` e `salmo` no header do modal, não vão para o corpo.

### 4. Print stylesheet (`css/culto-mensal.css`)

```css
@media print {
  body * { visibility: hidden; }
  #cultoMensalModal,
  #cultoMensalModal * { visibility: visible; }
  #cultoMensalModal {
    position: absolute;
    inset: 0;
    background: white !important;
    color: black !important;
  }
  .cm-no-print { display: none !important; }
  .cm-quote { page-break-inside: avoid; }
  h1, h2 { page-break-after: avoid; }
}
```

Os 3 botões do header recebem `class="cm-no-print"`.

## Fluxo do usuário

1. **Primeiro acesso do mês:** abre o site → badge "1" piscando no ícone envelope → clica → modal abre, badge some
2. **Acessos subsequentes no mesmo mês:** ícone visível sem badge → clica se quiser reler
3. **Imprimir:** dentro do modal, clica em Imprimir → diálogo de impressão do navegador → confirma → recebe versão limpa em papel
4. **Mês muda:** ymikaeru sobrescreve `data/culto_mensal_atual.md` e faz push → próximo acesso de qualquer usuário detecta 1ª linha diferente → badge reaparece

## Lista de arquivos

| Arquivo | Ação |
|---|---|
| `data/culto_mensal_atual.md` | **Novo** — cópia do conteúdo de maio/2026 do anexo |
| `js/culto-mensal.js` | **Novo** — lógica de fetch, badge, modal, parse, print |
| `css/culto-mensal.css` | **Novo** — modal + `@media print` |
| `index.html` | **Editado** — ícone no header, modal HTML, `<script>` e `<link>` com cache busting (`?v=N`) |

## Cache busting

Conforme `CLAUDE.md`, ao incluir os novos JS/CSS, adicionar `?v=1` na 1ª inclusão e bumpar em commits futuros se editados.

## Critérios de aceitação

- [ ] Ícone envelope aparece no header em todas as abas (mobile e desktop)
- [ ] Badge "1" aparece em primeira visita ao site após push do conteúdo
- [ ] Clicar no ícone abre modal com título, salmo e corpo legível
- [ ] Modal respeita os 6 temas (Original/Quiet/Paper/Calm/Focus/Bold)
- [ ] Modal respeita slider de tamanho de fonte global
- [ ] Citações de Meishu-Sama renderizadas com destaque visual (blockquote)
- [ ] Badge some após primeiro clique e não reaparece até o conteúdo do MD mudar
- [ ] Botão "Imprimir" abre diálogo do navegador com versão limpa (sem header/backdrop)
- [ ] Impressão preserva acentuação, blockquotes e quebra de página em pontos sensatos
- [ ] Mobile: modal full-screen com close button acessível, scroll funciona
- [ ] Sem regressão visual em outros componentes do header

## Fora de escopo (não fazer agora)

- Histórico de cultos passados (decisão #4 — usuário escolheu sobrescrever)
- TTS / áudio do conteúdo (pode vir em iteração futura)
- Compartilhamento social
- Suporte multilíngue (PT-BR apenas)
- Metadados de mês/ano no nome do arquivo (1ª linha é a fonte de verdade)
