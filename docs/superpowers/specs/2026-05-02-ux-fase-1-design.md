# UX — Fase 1: Correções e Polimento

**Data:** 2026-05-02
**Branch alvo:** será criada na fase de plano (sugestão: `fix/ux-fase-1`)
**Escopo:** correções de baixo risco e alto valor identificadas na varredura de UX
**Fora de escopo:** Fase 2 (fluxo do mapa) e Fase 3 (decisões de IA / busca / welcome)

## Contexto

Varredura de UX no estado atual identificou 11 ajustes. Foram decompostos em
3 fases por risco/esforço. Esta Fase 1 cobre 4 itens que não exigem decisões
de produto e são localizados em arquivos específicos.

A premissa em todos: **não introduzir comportamento novo**, apenas corrigir
inconsistências visíveis e dados duplicados que já vazam para a UI.

## Item 1 — Typo "Farmacológia" → "Farmacologia"

### Problema

A categoria `critica_farmacologica` é rotulada como `'Farmacológia'` (com
acento agudo no `o`) em [js/data.js:9](js/data.js:9). Aparece como label
da aba (nav), badge de categoria em cards e badge no modal de leitura.

A grafia correta em PT-BR é `Farmacologia` — sem acento (paroxítona terminada
em `-ia`, sílaba tônica em `lo`).

### Solução

Trocar a string em uma única posição:

```js
// js/data.js linha 9
critica_farmacologica: { label: 'Farmacologia', color: 'cat-purple' },
```

### Escopo de busca-e-substitui

- **Trocar:** apenas [js/data.js:9](js/data.js:9). É a fonte canônica do label.
- **Não trocar:** os 13 outros arquivos com a grafia errada são backups
  (`data/BKP/`), markdown fonte (`Markdown/MD_PT_v4/Aba Crítica Farmacologica.md`)
  ou documentos antigos. Não afetam a UI atual.

### Critério de aceitação

- Nav desktop e mobile mostram "Farmacologia"
- Badge de categoria nos cards mostra "Farmacologia"
- Badge no header do modal de leitura mostra "FARMACOLOGIA"
- Resultados da busca global mostram "FARMACOLOGIA" no badge de categoria

## Item 2 — Dedup case-insensitive de focal points no modal

### Problema

Em [js/modal.js:204-215](js/modal.js:204), `item.focusPoints` é renderizado
direto sem dedup. Para "Amigdalite – Inflamação das Amígdalas" o resultado é:

```
Amígdalas, Glândulas Linfáticas, Imediações das glândulas linfáticas
cervicais, Ombros, Pescoço, Rins, ombros, região das amígdalas, rins
```

Note "Ombros/ombros" e "Rins/rins" como duplicatas claras de capitalização.

### Solução

Dedup case-insensitive **preservando a primeira ocorrência** (mantém a
capitalização original do dado).

```js
// js/modal.js — substituir o `item.focusPoints.map(...)` por:
const seen = new Set();
const dedupedPoints = [];
for (const p of item.focusPoints) {
    const key = p.trim().toLowerCase();
    if (!seen.has(key)) {
        seen.add(key);
        dedupedPoints.push(p);
    }
}
const html = dedupedPoints.map(p => { /* render existente */ }).join('');
```

### Não-fazer (decisão explícita)

Não normalizar prefixos descritivos ("região de", "imediações de", "ao redor
de"). A nuance pode ser doutrinariamente relevante — Meishu-Sama diferencia
"ponto exato" de "imediações" em alguns ensinamentos. Resolver isso pertence
a um trabalho separado de qualidade de dados.

### Critério de aceitação

- Modal "Amigdalite – Inflamação das Amígdalas" não mostra "Ombros" e "ombros"
  juntos; aparece só uma versão (a primeira do array original)
- Outros modais que tenham duplicatas de capitalização também passam a
  exibir uma única entrada por ponto
- Dedup é apenas visual; o array `item.focusPoints` em STATE não é mutado

## Item 9 — Popular breadcrumb no header do modal de leitura

### Problema

O elemento `#modalBreadcrumb` existe em [index.html:401](index.html:401) mas
fica vazio. O usuário, ao chegar num artigo via "Veja Também" ou via "Ver
Ensinamento" do mapa, não vê de onde o artigo veio (categoria + fonte).

### Solução

Em [js/modal.js](js/modal.js), depois da linha 126 (onde `#modalCategory` é
populado), popular `#modalBreadcrumb` com 2 segmentos:

```
{Categoria}  ›  {Fonte}
```

Onde:
- **Categoria** = `catConfig.label` (mesmo valor que vai em `#modalCategory`)
- **Fonte** = `item.fonte` ou `item.info_pt` (já tem fallback em `modalFonte`)

Exemplo concreto: `ESTUDO DETALHADO  ›  Vol. 1, p. 32`

### Implementação

```js
// js/modal.js — após linha 126
const breadcrumbEl = document.getElementById('modalBreadcrumb');
if (breadcrumbEl) {
    const segments = [];
    if (catConfig?.label) segments.push(catConfig.label);
    const fonte = item.fonte || item.info_pt;
    if (fonte) segments.push(fonte);
    breadcrumbEl.innerHTML = segments
        .map(s => `<span>${escapeHtml(s)}</span>`)
        .join('<span class="opacity-40">›</span>');
}
```

Usar helper de escape existente (`escapeHtml` está em `js/core.js` ou
similar — confirmar no plano de implementação).

### Comportamento

- Visível apenas em desktop (já tem `hidden md:flex` no elemento)
- Se não houver fonte, mostra só a categoria (não fica órfão)
- Se a categoria for `Mapa` ou outro caso especial, ainda mostra
  (não filtrar — deixa o usuário ver onde está)

### Critério de aceitação

- Abrir um artigo de Estudo Detalhado: header mostra
  `ESTUDO DETALHADO › Vol. 1, p. 32` (ou similar)
- Abrir um artigo sem `info_pt`: header mostra apenas a categoria
- Mobile: breadcrumb não aparece (regra `hidden md:flex` mantida)

## Item 10 — Esconder citação amarela sem seleção ativa

### Problema

O bloco amarelo "Os pontos indicados são regiões aproximadas" em
[js/ui-renderer.js:263-316](js/ui-renderer.js:263) é renderizado sempre,
mesmo quando nenhuma condição está selecionada e nenhum filtro corporal
está ativo. Resultado: o aviso perde força por estar sempre presente, e
ocupa espaço desnecessário no estado de boas-vindas do mapa.

### Solução

Envolver o bloco amarelo num container com id e ocultar por padrão.
Mostrar apenas quando há seleção ativa (`bodyFilter` OU condição
selecionada via guia).

#### Mudança 1 — wrapper com id

[js/ui-renderer.js:264](js/ui-renderer.js:264) — adicionar `id="mapDisclaimer"`
e classe `hidden`:

```html
<div id="mapDisclaimer" class="hidden w-full max-w-full px-4 lg:px-8 mx-auto mt-6">
    <!-- bloco amarelo existente -->
</div>
```

#### Mudança 2 — helper de visibilidade

Criar uma função (em `js/guide.js` ou `js/body-map-helpers.js`):

```js
window.updateMapDisclaimerVisibility = function() {
    const el = document.getElementById('mapDisclaimer');
    if (!el) return;
    const hasSelection = !!STATE.bodyFilter || !!getActiveConditionKey();
    el.classList.toggle('hidden', !hasSelection);
};
```

`getActiveConditionKey` é uma getter que [js/guide.js](js/guide.js) já tem
implícito como `activeConditionKey` (módulo-local). Expor via
`window.getActiveConditionKey = () => activeConditionKey;` se ainda não está.

#### Mudança 3 — chamar nos pontos de mudança de seleção

Pontos onde `bodyFilter` ou `activeConditionKey` mudam:
- `selectConditionGuide` em [js/guide.js:215](js/guide.js:215)
- `clearConditionGuide` em [js/guide.js](js/guide.js) (próxima função)
- onde quer que `STATE.bodyFilter` seja setado/limpo nos handlers de
  filtro corporal — confirmar no plano

Adicionar chamada `updateMapDisclaimerVisibility()` ao final de cada um.

### Critério de aceitação

- Carregar a página na aba Mapa sem seleção: bloco amarelo não aparece
- Selecionar uma condição na sidebar: bloco amarelo aparece
- Limpar a seleção (clicar "— Todas as condições —"): bloco some
- Clicar num ponto corporal no mapa: bloco aparece
- Limpar filtro corporal: bloco some
- Trocar de aba e voltar: estado correto mantido

## Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Cache busting esquecido (CLAUDE.md armadilha #1) | Alta | Bumpar `?v=` em `index.html` para `js/data.js`, `js/modal.js`, `js/ui-renderer.js`, `js/guide.js` no commit final |
| Helper `getActiveConditionKey` não exposto | Média | Adicionar `window.getActiveConditionKey = ...` no início da implementação do item 10 |
| Tipo de `item.focusPoints` variar (string vs array) | Baixa | Já existe `if (item.focusPoints && item.focusPoints.length > 0)` antes; o dedup só roda dentro |
| Breadcrumb com fonte muito longa quebrar layout | Baixa | Elemento já tem `truncate` na classe — herda comportamento |

## Verificação manual (pós-implementação)

Lista do que rodar no preview antes de declarar pronto:

1. Aba Mapa, sem seleção → bloco amarelo escondido ✓
2. Selecionar "Amigdalite – Inflamação das Amígdalas" → bloco amarelo
   aparece, citação card abaixo aparece ✓
3. Limpar seleção → bloco amarelo some ✓
4. Clicar em "Ver Ensinamento" da Amigdalite → modal abre, focal points
   no header **sem duplicatas** (`Ombros` e `ombros` viram um só) ✓
5. Mesmo modal, em desktop, ver breadcrumb populado:
   `ESTUDO DETALHADO › ...` ✓
6. Conferir aba "Farmacologia" no nav (sem acento agudo) ✓
7. Mobile (375x812): tudo continua funcionando, breadcrumb fica oculto ✓

## Critérios de "pronto"

- Todos os 4 itens implementados conforme spec
- Verificação manual completa rodada no preview
- `?v=` bumpado em [index.html](index.html) para todos os JS alterados
- Commits separados por item (rastreabilidade) ou um commit único
  bem-descrito (preferência do dev) — decidir no plano
