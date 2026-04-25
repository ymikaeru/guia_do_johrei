# Cross-link condição → Estudo Aprofundado

**Data:** 2026-04-25
**Branch:** `feat/guia-atendimento-mapa` (continuação)
**Escopo:** Conectar a citação no painel da aba mapa com os ensinamentos originais de Meishu-Sama na aba Estudo Aprofundado

## Contexto

O ministrante na aba mapa seleciona uma condição (ex: "Tuberculose Faríngea"). Hoje:
- Card de citação aparece no `#guideCitationPanel` com pontos focais + trecho de Meishu-Sama (resumo)
- `#contentList` abaixo lista artigos com título contendo o nome da condição, **misturando** todas as abas (Por Condição, Por Região, Estudo Aprofundado, etc.)
- O ministrante NÃO percebe que parte desses cards são ensinamentos completos do Mioshie Zenshu (Estudo Aprofundado, 725 itens)
- Não há atalho explícito pra ler os textos completos no contexto dedicado

## Goals

- Quando há ensinamentos do Estudo Aprofundado relacionados a uma condição, oferecer um caminho explícito até eles
- Manter a `#contentList` atual (mistura de abas) e os badges de origem visíveis
- Sem quebrar nenhum fluxo existente (busca geral, navegação por aba, modal de leitura)

## Non-goals

- Não criar curadoria manual de relação condição→artigos (usaríamos só matching por título)
- Não mudar como a aba Estudo Aprofundado funciona internamente
- Não tocar em outras abas

## Componentes

### A. CTA "Ver N ensinamentos originais →" no card de citação

Adicionar ao final do `renderCitationPanel`, abaixo do trecho de Meishu-Sama (e antes do botão `×`), um botão condicional:

```
[Ver 18 ensinamentos originais de Meishu-Sama →]
```

**Quando aparece:**
- `count > 0` de artigos do `STATE.data.estudo_aprofundado` cujo título normalizado contém o termo normalizado da condição
- Se `count === 0`, omitir totalmente (nada de "Ver 0 ensinamentos")

**Click:**
1. Muda a aba ativa para `estudo_aprofundado` via `setTab('estudo_aprofundado')`
2. Aplica filtro de busca: preenche `#searchInput` (ou equivalente) com o termo da condição e dispara o filtro
3. O ministrante vê a lista filtrada na aba dedicada — apresentação natural com headers de Master_Title e estrutura completa

**Pluralização:**
- 1: "Ver 1 ensinamento original de Meishu-Sama"
- N: "Ver N ensinamentos originais de Meishu-Sama"

### B. Badge "Estudo Aprofundado" nos cards do contentList

**Já existe** em `js/ui.js:267`: `<span class="ci-cat" style="color:${catColor}">${catConfig.label}</span>`. Para `estudo_aprofundado`, isso renderiza "Estudo Aprofundado" com cor azul (`cat-blue` → `#2C5F8D`).

**O que verificar/melhorar:**
- Confirmar que o badge é visível e legível no card
- Se estiver discreto demais, aumentar peso visual (font-weight, border, background) APENAS para `estudo_aprofundado` cards — pra distinguir dos outros (que têm cores próprias mas mesmo estilo)
- **Decisão:** começar SEM mudanças de estilo (a label categórica já existe). Só ajustar se ficar invisível na prática.

### C. Match strategy

Usar `normalize()` (já existe em `guide.js`, função pura: NFD + strip diacritics + lowercase).

```javascript
function countEstudoMatchesFor(condLabel) {
    const items = STATE.data?.estudo_aprofundado || [];
    if (items.length === 0) return 0;
    const term = normalize(condLabel.replace(/\s*\(.*?\)\s*/g, '').replace(/[–-].*$/, '').trim());
    if (!term) return 0;
    return items.filter(it => normalize(it.title_pt || it.title || '').includes(term)).length;
}
```

Mesma lógica que `selectConditionGuide` já usa pra `searchTerm` — apenas restrito a `estudo_aprofundado` e usando `normalize()` em ambos os lados (acento-insensitive).

### D. Função de navegação

```javascript
function goToEstudoForCondition(condLabel) {
    const term = condLabel.replace(/\s*\(.*?\)\s*/g, '').replace(/[–-].*$/, '').trim();
    setTab('estudo_aprofundado');
    setTimeout(() => {
        // Set the active search input (whichever is visible at the time)
        const inp = document.getElementById('searchInput')
                 || document.getElementById('mobileSearchInput')
                 || document.getElementById('desktopSearchInput');
        if (inp) {
            inp.value = term;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        STATE.searchQuery = term;
        if (typeof applyFilters === 'function') applyFilters();
    }, 50);
}
```

O `setTimeout(50)` garante que `setTab` (que pode re-renderizar a UI) já tenha completado antes de aplicar o filtro.

## Files affected

| Arquivo | Mudança |
|---------|---------|
| `js/guide.js` | Adicionar `countEstudoMatchesFor`, `goToEstudoForCondition`, hook no `renderCitationPanel` para incluir o CTA condicional |
| `index.html` | Bump `?v=N` em `js/guide.js` |

`js/ui.js` (renderList) **não muda** — o badge já está lá.

## Edge cases

1. **`STATE.data.estudo_aprofundado` undefined/empty:** `countEstudoMatchesFor` retorna 0 → CTA omitido. Sem erro.
2. **Condição com label vazio ou só caracteres especiais:** `term` fica vazio → retorna 0 → CTA omitido.
3. **Busca após troca pra Estudo Aprofundado não ter o searchInput pronto:** o `setTimeout(50)` mitiga; se ainda assim falhar, `STATE.searchQuery` + `applyFilters` garante o filtro mesmo sem input visível.
4. **Cliente não acha resultados na Estudo Aprofundado mesmo com count>0:** isso seria bug do `applyFilters` — não previsto. Se ocorrer, usar `dispatchEvent('input')` no input força o filtro nativo.

## Validação manual

- [ ] Selecionar "Tuberculose Faríngea" → CTA mostra "Ver N ensinamentos originais →" (N>0, esperado ~18 por busca normalizada)
- [ ] Click no CTA → aba muda pra Estudo Aprofundado, busca preenchida, lista filtrada
- [ ] Selecionar "Amigdalite" → CTA NÃO aparece (sem matches no Estudo Aprofundado)
- [ ] Cards do `#contentList` que vêm de Estudo Aprofundado mostram label "Estudo Aprofundado" no topo (cor `cat-blue`)
- [ ] Voltar pra aba mapa → estado persiste ou re-seleção funciona normalmente
- [ ] Mobile: CTA visível, click funciona, lista filtrada na Estudo Aprofundado

## Riscos

- **Baixo:** Mudança restrita a `js/guide.js` (~30 linhas) e markup do `renderCitationPanel`
- **Baixo:** Reutiliza infraestrutura existente (`setTab`, `applyFilters`, `normalize`, badge no `renderList`)
- **Médio (se acontecer):** algumas condições podem ter falsos positivos no matching (ex: "Estômago" também casa "Câncer no Estômago" e similares — isso é desejável, não bug)
