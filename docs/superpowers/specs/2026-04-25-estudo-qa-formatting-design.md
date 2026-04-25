# Formatação P&R no leitor de Estudo Aprofundado

**Data:** 2026-04-25
**Branch:** `feat/guia-atendimento-mapa` (continuação)
**Escopo:** Modal de leitura de artigos do Estudo Aprofundado — distinguir visualmente pergunta do fiel vs resposta de Meishu-Sama

## Contexto

A aba Estudo Aprofundado tem 725 ensinamentos. ~85% seguem o formato:

```
Ensinamento de Meishu-Sama: "[título]" (data) Pergunta do fiel
"H.R. (52 anos, sexo masculino), ingressei na fé..."
Resposta de Meishu-Sama
"Ferir o olho de peixe com um bisturi significa..."
```

Hoje, ao abrir um artigo, o usuário vê uma parede de texto contínua passando por 3 fases (cabeçalho, pergunta do fiel, resposta de Meishu-Sama) sem distinção visual. Isso dificulta:
- Identificar rapidamente qual parte é a resposta sagrada de Meishu-Sama
- Pular para a resposta direto sem ler a pergunta inteira
- Reverenciar visualmente as palavras de Meishu-Sama (Kotodama)

## Goals

- Distinguir visualmente as 3 seções (cabeçalho, pergunta, resposta) num artigo de Estudo Aprofundado
- Espelhar o estilo do `#guideCitationPanel` existente (paleta consistente)
- Funcionar para os 85% que têm o padrão; os 15% restantes (ensaios diretos, sem Q&A) renderizam como hoje
- Não quebrar busca, highlight de focus points, ou outras features do modal

## Non-goals

- Não criar nova aba ou view
- Não modificar a estrutura dos JSONs de dados
- Não tratar artigos de outras abas (Fundamentos, Como Aplicar, etc.) que tenham conteúdo Q&A — escopo é estudo_aprofundado
- Não adicionar áudio, ícones decorativos, ou avatares

## Estratégia de detecção

**Por presença de marcadores no conteúdo, não por aba.** Se `content_pt` contém:
- "Pergunta do Fiel" / "Pergunta do fiel" (case-insensitive)
- E/OU "Resposta de Meishu-Sama" (case-insensitive)

Então aplica formatação Q&A; senão fallback pro fluxo atual (`formatBodyText`).

Razão: detecção content-driven é robusta a artigos de outras abas que coincidentemente sigam o padrão (improvável mas tolerável) e simples de implementar (não precisa passar `_cat` como parâmetro).

## Componentes

### 1. `parseEstudoSections(content)` em `js/ui.js`

Pura, sem efeitos colaterais. Retorna:

```javascript
{
    isQA: boolean,      // true se algum marcador foi achado
    header: string,     // tudo antes de "Pergunta do Fiel" (ou antes de "Resposta" se sem pergunta)
    question: string,   // entre "Pergunta do Fiel" e "Resposta" (vazio se sem pergunta)
    answer: string      // depois de "Resposta de Meishu-Sama" (vazio se sem resposta)
}
```

Implementação:

```javascript
function parseEstudoSections(content) {
    if (!content) return { isQA: false, header: '', question: '', answer: '' };
    const PERGUNTA = /Pergunta\s+do\s+Fiel/i;
    const RESPOSTA = /Resposta\s+de\s+Meishu-Sama/i;

    const pMatch = content.match(PERGUNTA);
    const rMatch = content.match(RESPOSTA);

    if (!pMatch && !rMatch) {
        return { isQA: false, header: content, question: '', answer: '' };
    }

    let header = '';
    let question = '';
    let answer = '';

    if (pMatch && rMatch && rMatch.index > pMatch.index) {
        header = content.slice(0, pMatch.index).trim();
        question = content.slice(pMatch.index + pMatch[0].length, rMatch.index).trim();
        answer = content.slice(rMatch.index + rMatch[0].length).trim();
    } else if (pMatch && !rMatch) {
        header = content.slice(0, pMatch.index).trim();
        question = content.slice(pMatch.index + pMatch[0].length).trim();
    } else if (rMatch && !pMatch) {
        header = content.slice(0, rMatch.index).trim();
        answer = content.slice(rMatch.index + rMatch[0].length).trim();
    } else {
        // Both matched but in unexpected order — fall back to simple
        return { isQA: false, header: content, question: '', answer: '' };
    }

    return { isQA: true, header, question, answer };
}
```

### 2. `formatEstudoBody(text, searchQuery, focusPoints)` em `js/ui.js`

Wrapper que decide qual formato usar:

```javascript
function formatEstudoBody(text, searchQuery, focusPoints) {
    const sections = parseEstudoSections(text);
    if (!sections.isQA) {
        return formatBodyText(text, searchQuery, focusPoints);
    }

    const headerHtml = sections.header
        ? `<div class="estudo-header">${formatBodyText(sections.header, searchQuery, focusPoints)}</div>`
        : '';
    const questionHtml = sections.question
        ? `<div class="estudo-section estudo-pergunta">
                <span class="estudo-section-label">Pergunta do Fiel</span>
                ${formatBodyText(sections.question, searchQuery, focusPoints)}
           </div>`
        : '';
    const answerHtml = sections.answer
        ? `<div class="estudo-section estudo-resposta">
                <span class="estudo-section-label">Meishu-Sama</span>
                ${formatBodyText(sections.answer, searchQuery, focusPoints)}
           </div>`
        : '';

    return headerHtml + questionHtml + answerHtml;
}
```

Reutiliza `formatBodyText` internamente em cada seção → preserva highlight de busca, focus points, markdown bold/italic, headers `#`, etc.

### 3. CSS em `style.css`

```css
/* Estudo Aprofundado — Q&A formatting */
.estudo-header {
    padding: 12px 0 16px;
    border-bottom: 1px solid #e8e4da;
    margin-bottom: 20px;
}
.estudo-section {
    padding: 16px 20px;
    border-radius: 8px;
    margin: 12px 0;
}
.estudo-pergunta {
    background: #f5f5f4;
}
.estudo-resposta {
    background: #fafaf8;
    border: 1px solid #e8e4da;
    font-style: italic;
    color: #555;
}
.estudo-section-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    color: #888;
    margin-bottom: 8px;
    font-style: normal;
}
/* Dark mode */
.dark .estudo-pergunta { background: #1a1a1a; }
.dark .estudo-resposta { background: #161616; border-color: #2a2520; color: #ccc; }
.dark .estudo-section-label { color: #888; }
.dark .estudo-header { border-bottom-color: #2a2520; }
```

### 4. `js/modal.js` — substituir chamadas

Em `openModal` (linhas ~218-221), trocar 2 chamadas para `formatEstudoBody`:
- `contentPT` → usa `formatEstudoBody(pt, ...)`
- `contentComparePT` → usa `formatEstudoBody(pt, ...)`

As 2 vistas JP (`contentJP`, `contentCompareJP`) permanecem com `formatBodyText` — markers em PT não aparecem no texto japonês.

## Edge cases

1. **Conteúdo sem markers** (15% dos ensaios): `parseEstudoSections` retorna `isQA: false`, `formatEstudoBody` delega pra `formatBodyText`. Sem mudança visual.
2. **Só "Pergunta do Fiel" sem "Resposta de Meishu-Sama"**: header + pergunta, sem bloco de resposta. Útil pra artigos que terminam com pergunta retórica.
3. **Só "Resposta de Meishu-Sama" sem "Pergunta do Fiel"**: header + resposta. Acontece quando Meishu-Sama responde direto sem citar pergunta.
4. **Ordem invertida (Resposta antes de Pergunta)**: improvável, mas se acontecer, fallback pro formato atual.
5. **Múltiplas perguntas/respostas no mesmo artigo**: regex pega só a PRIMEIRA ocorrência. Outros artigos com múltiplos turnos teriam apenas o primeiro turno destacado, resto vai pro `answer` block. Tolerável v1.
6. **Markdown inside seções** (`**bold**`, headers `#`): `formatBodyText` interno cuida disso.
7. **Busca highlight**: preservado porque `formatBodyText` é reusado.

## Files affected

| Arquivo | Mudança |
|---------|---------|
| `js/ui.js` | + 2 funções (`parseEstudoSections`, `formatEstudoBody`) |
| `js/modal.js` | 2 substituições de `formatBodyText(pt, ...)` por `formatEstudoBody(pt, ...)` em PT views (não JP) |
| `style.css` | + ~25 linhas de classes `.estudo-*` (light + dark) |
| `index.html` | bump cache de `js/ui.js`, `js/modal.js`, `style.css` |

Total: ~80 LOC.

## Riscos

- **Baixo:** Lógica isolada em duas funções puras + CSS classes scopadas. Fallback robusto pro formato atual quando markers não existem.
- **Baixo:** Reusa `formatBodyText` em cascata, então qualquer feature dele (highlight, focus, markdown) continua funcionando dentro das seções.
- **Médio se acontecer:** Regex de markers pode não pegar variações ortográficas raras (ex: "Pergunta de fiel" sem o "do") — nesses casos, fallback pro formato atual. Aceitável.

## Validação manual

- [ ] Abrir um artigo de Estudo Aprofundado (ex: "Ponto vital do Johrei para tuberculose pulmonar") → 3 seções visíveis: header, pergunta cinza, resposta creme
- [ ] Buscar palavra dentro do artigo → highlight funciona dentro de cada seção
- [ ] Abrir um artigo SEM Q&A (ensaio direto) → renderiza como hoje (texto contínuo)
- [ ] Modo dark → cores adequadas, contraste preservado
- [ ] Modal de comparação PT/JP → PT formatado em seções, JP formatado normal (sem markers em japonês)
- [ ] Cross-link da aba mapa → click no CTA "Ver N ensinamentos originais" → abrir um artigo da lista filtrada → ver formatação Q&A
- [ ] Mobile → seções empilham verticalmente, padding adequado
