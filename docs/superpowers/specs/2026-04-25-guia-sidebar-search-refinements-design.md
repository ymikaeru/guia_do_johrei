# Refinamentos da busca na sidebar do Guia de Atendimento

**Data:** 2026-04-25
**Branch:** `feat/guia-atendimento-mapa`
**Escopo:** UX da busca de condições na aba `mapa`

## Contexto

A busca de condições já existe e está funcional:

- Input desktop em `js/ui-renderer.js:145` (`#guiaSidebarSearch`)
- Input mobile injetado dinamicamente em `js/guide.js:256` no modal
- Função `filterGuiaSidebar(q)` em `js/guide.js:63` faz `c.label.toLowerCase().includes(q.toLowerCase())`

O `HANDOFF.md` registrou "input já existe, falta testar UX". Após inspeção, identificamos 5 lacunas concretas de UX que este spec resolve.

## Lacunas a resolver

1. **Acentos não são normalizados** — buscar "estomago" não acha "Estômago"; ministrante mobile digita rápido sem acentuação.
2. **Sem feedback de zero resultados** — lista fica em branco se nada bate.
3. **Botão limpar (X) inconsistente** — `type="search"` mostra X em Chrome/Safari mas com estilo discreto e variação entre browsers.
4. **Citação some ao buscar** — após selecionar condição, o card de citação é destruído quando o usuário digita na busca; perde contexto.
5. **Sem foco automático** — usuário precisa clicar no input para começar a buscar.

## Design

### 1. Normalização de acentos

Helper em `js/guide.js`:
```js
function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
```

Aplicar em `generateConditionOptions` ao filtrar:
```js
const q = normalize(filter);
const list = q ? guiaConditions.filter(c => normalize(c.label).includes(q)) : guiaConditions;
```

### 2. Empty state

Quando `list.length === 0` e `q` não vazio, retornar HTML de placeholder:
```html
<div class="px-5 py-8 text-center text-[11px] text-gray-400">
    Nenhuma condição para «<query>»
    <button onclick="document.getElementById('guiaSidebarSearch').value='';filterGuiaSidebar('')"
        class="block mx-auto mt-2 text-[10px] underline">limpar busca</button>
</div>
```

### 3. Botão limpar visível

CSS em `style.css` para garantir consistência visual:
```css
#guiaSidebarSearch::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    width: 14px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'><path d='M4 4l6 6M10 4l-6 6' stroke='%23999' stroke-width='1.5' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat;
    background-position: center;
    cursor: pointer;
    opacity: .5;
}
#guiaSidebarSearch::-webkit-search-cancel-button:hover { opacity: 1; }
```

Sem JS adicional — o `type="search"` nativo dispara o evento de limpeza.

### 4. Citação preservada durante busca

Refatorar `filterGuiaSidebar(q)`:
- Se `activeConditionKey` está setado, preservar o card de citação no topo da sidebar e filtrar apenas a seção "Outras condições" abaixo.
- Se não há condição ativa, comportamento atual (prefix "— Todas as condições —" + lista).

Implementação: em vez de regenerar tudo, ler o estado de `activeConditionKey` e construir o HTML conforme.

### 5. Foco automático (desktop only)

Em `showConditionSelector()`:
```js
if (window.matchMedia('(min-width: 1024px)').matches) {
    setTimeout(() => {
        const inp = document.getElementById('guiaSidebarSearch');
        if (inp) inp.focus();
    }, 200);
}
```

Mobile fica de fora porque `focus()` abre o teclado virtual e atrapalha.

## Arquivos afetados

- `js/guide.js` — helper `normalize()`, refatorar `generateConditionOptions` e `filterGuiaSidebar`, autofocus em `showConditionSelector`
- `style.css` — regra para `::-webkit-search-cancel-button`
- `index.html` — bump `?v=N` para `js/guide.js` e `style.css`

## Riscos

- Item 4 é o mais delicado: muda a estrutura do DOM quando há condição ativa + busca. Risco baixo (só DOM, sem efeitos colaterais), mas requer teste manual.
- Autofocus em desktop pode irritar se for muito agressivo — usamos `setTimeout(200)` para evitar disputa de foco.

## Validação

Manual no preview (Chrome desktop + resize mobile):
- [ ] Buscar "estomago" acha "Estômago"
- [ ] Buscar "xyz" mostra empty state com botão "limpar busca" funcional
- [ ] Botão X dentro do input limpa e restaura lista completa
- [ ] Selecionar condição → digitar na busca → citação permanece no topo
- [ ] Trocar para aba `mapa` em desktop → input recebe foco automaticamente
- [ ] Trocar para aba `mapa` em mobile (resize ≤ 1023px) → input NÃO recebe foco
