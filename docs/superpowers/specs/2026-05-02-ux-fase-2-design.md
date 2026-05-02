# UX — Fase 2: Chevron "Ver pontos" no Mapa

**Data:** 2026-05-02
**Branch alvo:** `fix/ux-fase-2` (a partir de `feat/pt-only-on-origin-main`)
**Escopo:** único item — botão chevron fixo que aparece quando o card de pontos focais está abaixo do viewport após seleção de condição
**Fora de escopo:** pills↔dots linking (#6, decidido C), sidebar dedup (#5, decidido C)

## Contexto

Quando o ministrante seleciona uma condição na sidebar do Mapa, um card com pontos focais e citação de Meishu-Sama aparece em `#contextPanel` abaixo dos diagramas corporais. Em resoluções típicas de laptop (≤900px de altura) e em mobile, esse card fica fora do viewport. O usuário não recebe sinal visual de que algo mudou abaixo.

A solução é um botão chevron fixo que aparece automaticamente quando o card está fora do viewport (via `IntersectionObserver`) e desaparece quando o card entra na tela. Um click faz scroll suave até o card.

## Elemento HTML

Adicionar em `index.html`, dentro do `<body>`, após os modais existentes e antes dos `<script>` tags:

```html
<!-- Chevron: aparece quando #contextPanel está abaixo do viewport após seleção -->
<button id="scrollToCardBtn"
    onclick="scrollToConditionCard()"
    class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[80]
           flex items-center gap-1.5
           bg-black text-white dark:bg-white dark:text-black
           py-2 px-4 rounded-full shadow-lg
           text-xs font-bold uppercase tracking-widest
           transition-opacity duration-200 opacity-0"
    aria-label="Ver pontos focais">
    Ver pontos
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
    </svg>
</button>
```

Dois estados via classes:
- **Oculto:** `hidden opacity-0` (padrão)
- **Visível:** remover `hidden`, adicionar `opacity-100` com delay de 1 frame (para a transição CSS funcionar)

## Lógica JavaScript (`js/guide.js`)

### Variável de controle

```js
let _cardObserver = null; // IntersectionObserver para o contextPanel
```

Declarar junto com `activeConditionKey` e `SYNONYMS_PT` no topo do arquivo.

### Helper `updateScrollChevron(visible)`

```js
function updateScrollChevron(visible) {
    const btn = document.getElementById('scrollToCardBtn');
    if (!btn) return;
    if (visible) {
        btn.classList.remove('hidden');
        requestAnimationFrame(() => btn.classList.replace('opacity-0', 'opacity-100'));
    } else {
        btn.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => btn.classList.add('hidden'), 200);
    }
}
```

### Helper `startCardObserver()`

Chamado após o card ser renderizado em `selectConditionGuide`:

```js
function startCardObserver() {
    if (_cardObserver) {
        _cardObserver.disconnect();
        _cardObserver = null;
    }
    const panel = document.getElementById('contextPanel');
    if (!panel) return;

    _cardObserver = new IntersectionObserver(
        ([entry]) => updateScrollChevron(!entry.isIntersecting),
        { threshold: 0.1 }
    );
    _cardObserver.observe(panel);
}
```

`threshold: 0.1` — o chevron some quando pelo menos 10% do card está visível (evita flickering na borda exata).

### `window.scrollToConditionCard` (exposto como global)

Chamado pelo `onclick` do botão:

```js
window.scrollToConditionCard = function() {
    const panel = document.getElementById('contextPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateScrollChevron(false);
};
```

### Chamadas nos pontos de mudança de seleção

**Em `selectConditionGuide`**, após `renderCitationPanel(cond)` (linha ~230):
```js
    startCardObserver();
```

**Em `clearConditionGuide`**:
```js
    if (_cardObserver) { _cardObserver.disconnect(); _cardObserver = null; }
    updateScrollChevron(false);
```

**Em `updateMapDisclaimerVisibility`** (já existe em `js/guide.js` após Fase 1), adicionar ao final:
```js
    // Reconectar observer se tab-switch recriou o DOM com condição ainda ativa
    if (activeConditionKey) startCardObserver();
```

Isso garante que ao trocar de aba e voltar com condição ativa, o observer aponta para o novo `#contextPanel` recriado por `renderBodyMapViews`.

## Posicionamento e estilo

- `fixed bottom-6 left-1/2 -translate-x-1/2`: centro inferior, 24px da borda
- `z-[80]`: acima do conteúdo comum mas abaixo de modais (`z-[600]`) e header (`z-[500]`)
- `bg-black text-white dark:bg-white dark:text-black`: respeita o tema do site
- Tamanho: `py-2 px-4 text-xs font-bold uppercase tracking-widest` — consistente com o estilo dos pills ativos no card
- Shadow: `shadow-lg` — distingue do conteúdo de fundo
- Fade: `transition-opacity duration-200` — aparece/desaparece suavemente

## Comportamento esperado

| Ação | Resultado |
|---|---|
| Página carrega na aba Mapa | Chevron não aparece |
| Seleciona condição cujo card fica abaixo da tela | Chevron aparece com fade-in |
| Seleciona condição cujo card já está visível | Chevron não aparece |
| Clica no chevron | Scroll suave até o card, chevron desaparece |
| Scroll manual até o card | Chevron desaparece (IntersectionObserver dispara) |
| Clica "— Todas as condições —" | Chevron desaparece imediatamente |
| Troca de aba (mapa → fundamentos → mapa) | Chevron não aparece (observer desconectado no clear) |
| Mobile | Funciona igual — card sempre abaixo dos mapas |

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| `IntersectionObserver` não suportado (IE) | `typeof IntersectionObserver !== 'undefined'` guard em `startCardObserver` |
| Observer não desconecta em tab-switch | `clearConditionGuide` já desconecta; `setTab('mapa')` não precisa fazer nada extra porque o observer só está ativo quando há condição selecionada |
| Botão sobrepõe o FRENTE/COSTAS toggle no mobile | `bottom-6` (24px) deixa margem suficiente acima do toggle que fica em `bottom-0`; se necessário ajustar para `bottom-16` em mobile via `sm:bottom-6` |
| CRLF flip (aprendizado Fase 1) | Usar `Edit` tool sempre; `git add` sem `-c core.autocrlf=false` |

## Verificação manual (pós-implementação)

1. Aba Mapa sem seleção → chevron não aparece ✓
2. Selecionar condição em desktop 1280×800 → chevron aparece com fade ✓
3. Click no chevron → scroll suave até card, chevron desaparece ✓
4. Scroll manual de volta ao topo do mapa → chevron reaparece ✓
5. Scroll até card → chevron desaparece ✓
6. Limpar seleção → chevron some imediatamente ✓
7. Mobile 375×812 → chevron aparece após seleção ✓
8. Tema dark → chevron aparece com fundo branco texto preto ✓

## Critérios de "pronto"

- Comportamento da tabela acima verificado no preview
- Commit em `fix/ux-fase-2` com stat limpo (sem CRLF flip)
- `?v=` bumpado em `index.html` para `js/guide.js`
