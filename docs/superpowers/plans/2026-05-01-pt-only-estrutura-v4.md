# PT-Only + Estrutura MD_PT_v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter 4 arquivos MD_PT_v4 em JSON estruturado, substituir tabs antigas por Fundamentos/Como Aplicar/Crítica à Farmacologia/Por Condição, e remover toda a UI bilíngue JP/PT.

**Architecture:** Script Python gera 4 `data/tab_<id>.json` com hierarquia sub-aba→categoria→artigo. Core.js carrega esses arquivos e os achata em `STATE.data[tabId]` (listas planas, compatíveis com renderList existente) enquanto guarda a estrutura hierárquica em `STATE.tabStructure[tabId]` para renderizar chips de sub-aba e cabeçalhos de categoria. Modal mostra apenas `conteudo` (PT) sem toggle de idioma.

**Tech Stack:** Python 3 (script), HTML/CSS/JS vanilla, Tailwind CDN, sem npm/bundler.

---

## Mapa de arquivos

| Arquivo | Ação |
|---|---|
| `scripts/parse_md_v4.py` | Criar |
| `data/tab_fundamentos.json` | Gerado pelo script |
| `data/tab_como_aplicar.json` | Gerado pelo script |
| `data/tab_critica_farmacologia.json` | Gerado pelo script |
| `data/tab_por_condicao.json` | Gerado pelo script |
| `data/index.json` | Modificar — nova estrutura simples |
| `js/data.js` | Modificar — atualizar CONFIG.modes.ensinamentos.cats |
| `js/state.js` | Modificar — adicionar activeSubAba, tabStructure |
| `js/core.js` | Modificar — loadTabData + flattenTabData + loadData |
| `index.html` | Modificar — remover bilíngue, adicionar #subAbaChipsContainer e #modalFonte |
| `js/modal.js` | Modificar — remover switchLanguageView, usar conteudo/titulo/fonte |
| `js/ui-renderer.js` | Modificar — renderTabs com novos nomes, hero + chips antes da lista |
| `js/ui.js` | Modificar — renderList injeta cabeçalhos de categoria |
| `js/filters.js` | Modificar — setSubAbaFilter + condição em applyFilters |
| `css/volume-modal.css` | Modificar — comentar CSS bilíngue |

---

## Task 1: Script Python — parse MD → JSON

**Files:**
- Create: `scripts/parse_md_v4.py`
- Generates: `data/tab_fundamentos.json`, `data/tab_como_aplicar.json`, `data/tab_critica_farmacologia.json`, `data/tab_por_condicao.json`

- [ ] **Step 1: Criar `scripts/parse_md_v4.py`**

```python
#!/usr/bin/env python3
"""Parse Markdown MD_PT_v4 files into structured tab JSON.

Schema output per file:
{
  "id": "fundamentos",
  "aba": "Fundamentos",
  "hero": null,                      # tab-level hero (optional)
  "sub_abas": [
    {
      "id": "default",
      "titulo": null,                # null for tabs with no sub-aba
      "hero": null,                  # sub-aba-level hero (optional)
      "categorias": [
        {
          "titulo": null,            # null for groups with no header
          "artigos": [
            {
              "id": "fundamentos_001",
              "titulo": "O que é a Doença",
              "fonte": "Mioshie-shū n.º 23, pág. 47",
              "conteudo": "..."
            }
          ]
        }
      ]
    }
  ]
}
"""
import re
import json
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
MD_DIR   = BASE_DIR / "Markdown" / "MD_PT_v4"
OUT_DIR  = BASE_DIR / "data"

# (filename, tab_id, display_name)
MD_FILES = [
    ("Aba Fundamentos.md",                  "fundamentos",           "Fundamentos"),
    ("Aba Pratica.md",                      "como_aplicar",          "Como Aplicar"),
    ("Aba Crítica Farmacologica.md",        "critica_farmacologia",  "Crítica à Farmacologia"),
    ("Aba Orientações por Purificação.md",  "por_condicao",          "Por Condição"),
]

def clean_md(text):
    """Remove markdown escapes (\\. \\[ \\]) and strip."""
    return re.sub(r'\\([.\[\]#])', r'\1', text).strip()

def slugify(text):
    trans = str.maketrans(
        'ãâáàäêéèëíìîïõôóòöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
    )
    text = text.lower().translate(trans)
    return re.sub(r'[^a-z0-9]+', '_', text).strip('_')

def parse_md(filepath, tab_id, tab_name):
    with open(filepath, encoding='utf-8') as f:
        lines = f.readlines()

    tab = {"id": tab_id, "aba": tab_name, "hero": None, "sub_abas": []}

    current_sub = None   # current sub_aba dict
    current_cat = None   # current categoria dict
    current_art = None   # current artigo dict
    buf          = []    # content buffer for current article
    art_counter  = 0
    hero_target  = tab   # where the next [Hero] should be written

    def ensure_default_sub():
        nonlocal current_sub, current_cat
        if not tab["sub_abas"]:
            current_sub = {"id": "default", "titulo": None, "hero": None, "categorias": []}
            tab["sub_abas"].append(current_sub)
        # ensure at least one categoria
        if current_sub and not current_sub["categorias"]:
            current_cat = {"titulo": None, "artigos": []}
            current_sub["categorias"].append(current_cat)

    def ensure_cat():
        nonlocal current_cat
        ensure_default_sub()
        if current_cat is None:
            current_cat = {"titulo": None, "artigos": []}
            current_sub["categorias"].append(current_cat)

    def flush_art():
        nonlocal current_art, buf
        if current_art is not None:
            current_art["conteudo"] = "\n".join(buf).rstrip()
        current_art = None
        buf = []

    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n')

        # ── [Aba] header — skip, name comes from MD_FILES ──────────────
        if re.match(r'^#+\s*\\\[Aba\\\]', line):
            i += 1
            continue

        # ── [Hero] ──────────────────────────────────────────────────────
        m = re.match(r'^\s*\\\[Hero\\\]\s*(.*)', line)
        if m:
            flush_art()
            # strip accidental leading ] from source typo "]É importante..."
            hero_txt = clean_md(m.group(1)).lstrip(']').strip()
            i += 1
            # collect continuation lines until next header or marker
            while i < len(lines):
                nxt = lines[i].rstrip('\n')
                if re.match(r'^#', nxt) or re.match(r'^\s*\\\[', nxt):
                    break
                if nxt.strip():
                    hero_txt += '\n' + nxt.strip()
                i += 1
            hero_target["hero"] = hero_txt or None
            continue

        # ── [Sub-aba] ────────────────────────────────────────────────────
        m = re.match(r'^#+\s*\\\[Sub-aba\\\]\s*(.*)', line, re.IGNORECASE)
        if m:
            flush_art()
            titulo = clean_md(m.group(1))
            current_sub = {"id": slugify(titulo), "titulo": titulo, "hero": None, "categorias": []}
            tab["sub_abas"].append(current_sub)
            current_cat = None
            hero_target = current_sub   # next [Hero] targets this sub-aba
            i += 1
            continue

        # ── [Titulo Categoria] explicit ──────────────────────────────────
        m = re.match(r'^#+\s*\\\[Titulo Categoria\\\]\s*(.*)', line, re.IGNORECASE)
        if m:
            flush_art()
            ensure_default_sub()
            titulo = clean_md(m.group(1))
            current_cat = {"titulo": titulo, "artigos": []}
            current_sub["categorias"].append(current_cat)
            i += 1
            continue

        # ── Bare # heading (not a special marker) → implicit Titulo Categoria
        # Handles Roman-numeral sections in Aba Pratica.md
        m = re.match(r'^#(?!#)\s+(.*)', line)
        if m:
            raw = m.group(1)
            # skip if it still has an unhandled marker (safety)
            if re.search(r'\\\[', raw):
                i += 1
                continue
            flush_art()
            ensure_default_sub()
            titulo = clean_md(raw)
            current_cat = {"titulo": titulo, "artigos": []}
            current_sub["categorias"].append(current_cat)
            i += 1
            continue

        # ── ## Article ───────────────────────────────────────────────────
        m = re.match(r'^##(?!#)\s+(.*)', line)
        if m:
            flush_art()
            ensure_cat()
            art_counter += 1
            raw_titulo = m.group(1)
            # Remove leading "1\." or "1." number
            titulo = re.sub(r'^[\d]+[\\.]?\s*', '', clean_md(raw_titulo)).strip()

            # Look ahead for fonte: first italic line *...*
            fonte = None
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines):
                fm = re.match(r'^\*([^*]+)\*\s*$', lines[j].strip())
                if fm:
                    fonte = fm.group(1).strip()
                    i = j  # will be incremented below

            art_id = f"{tab_id}_{art_counter:03d}"
            current_art = {"id": art_id, "titulo": titulo, "fonte": fonte, "conteudo": ""}
            buf = []
            current_cat["artigos"].append(current_art)
            i += 1
            continue

        # ── ### sub-point → concatenate into current article ─────────────
        m = re.match(r'^###\s+(.*)', line)
        if m and current_art is not None:
            buf.append("### " + clean_md(m.group(1)))
            i += 1
            continue

        # ── Regular content ──────────────────────────────────────────────
        if current_art is not None:
            buf.append(line)
        i += 1

    flush_art()
    return tab


def main():
    for md_name, tab_id, tab_name in MD_FILES:
        filepath = MD_DIR / md_name
        print(f"Parsing {md_name} ...")
        tab = parse_md(filepath, tab_id, tab_name)

        total_arts = sum(
            len(c["artigos"])
            for s in tab["sub_abas"]
            for c in s["categorias"]
        )
        sub_names = [s["titulo"] or "(default)" for s in tab["sub_abas"]]
        print(f"  sub-abas: {sub_names}")
        print(f"  total artigos: {total_arts}")

        out = OUT_DIR / f"tab_{tab_id}.json"
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(tab, f, ensure_ascii=False, indent=2)
        print(f"  → {out}\n")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Executar o script**

```bash
cd C:\Mioshie_Sites\guia_johrei
python scripts/parse_md_v4.py
```

Expected output (approximately):
```
Parsing Aba Fundamentos.md ...
  sub-abas: ['(default)']
  total artigos: 10+
  → data\tab_fundamentos.json

Parsing Aba Pratica.md ...
  sub-abas: ['(default)']
  total artigos: 20+
  → data\tab_como_aplicar.json

Parsing Aba Crítica Farmacologica.md ...
  sub-abas: ['Ensinamentos']
  total artigos: 15+
  → data\tab_critica_farmacologia.json

Parsing Aba Orientações por Purificação.md ...
  sub-abas: ['tuberculose', ...]
  total artigos: 50+
  → data\tab_por_condicao.json
```

- [ ] **Step 3: Verificar primeiro artigo de cada tab**

```bash
python -c "
import json
for tid in ['fundamentos','como_aplicar','critica_farmacologia','por_condicao']:
    d = json.load(open(f'data/tab_{tid}.json', encoding='utf-8'))
    art = d['sub_abas'][0]['categorias'][0]['artigos'][0]
    print(f\"[{tid}] id={art['id']} titulo='{art['titulo'][:50]}' fonte='{art.get('fonte','')[:40]}'\")
    print(f\"  conteudo[:80]: {art['conteudo'][:80]!r}\")
    print()
"
```

Cada artigo deve ter `id`, `titulo` não-vazio, e `conteudo` não-vazio.

- [ ] **Step 4: Commit**

```bash
git add scripts/parse_md_v4.py data/tab_fundamentos.json data/tab_como_aplicar.json data/tab_critica_farmacologia.json data/tab_por_condicao.json
git commit -m "feat(data): parse MD_PT_v4 → 4 tab JSON files

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Atualizar data/index.json e js/data.js

**Files:**
- Modify: `data/index.json`
- Modify: `js/data.js`

- [ ] **Step 1: Substituir `data/index.json` completo**

Substituir o conteúdo inteiro por:

```json
{
  "version": "5.0",
  "last_updated": "2026-05-01",
  "tabs": [
    { "id": "fundamentos",          "name": "Fundamentos",            "file": "tab_fundamentos.json" },
    { "id": "como_aplicar",         "name": "Como Aplicar",           "file": "tab_como_aplicar.json" },
    { "id": "critica_farmacologia", "name": "Crítica à Farmacologia", "file": "tab_critica_farmacologia.json" },
    { "id": "por_condicao",         "name": "Por Condição",           "file": "tab_por_condicao.json" },
    { "id": "estudo_aprofundado",   "name": "Estudo Aprofundado" },
    { "id": "mapa",                 "name": "Mapa" }
  ]
}
```

- [ ] **Step 2: Atualizar `CONFIG.modes.ensinamentos.cats` em `js/data.js`**

Localizar (linhas 6-10):
```javascript
cats: {
    fundamentos: { label: 'Fundamentos', color: 'cat-blue' },
    qa: { label: 'Perguntas e Orientações', color: 'cat-green' },
    pontos_focais: { label: 'Casos Específicos', color: 'cat-purple' }
}
```

Substituir por:
```javascript
cats: {
    fundamentos:          { label: 'Fundamentos',            color: 'cat-blue' },
    como_aplicar:         { label: 'Como Aplicar',           color: 'cat-green' },
    critica_farmacologia: { label: 'Crítica à Farmacologia', color: 'cat-purple' },
    por_condicao:         { label: 'Por Condição',           color: 'cat-dark' },
    estudo_aprofundado:   { label: 'Estudo Aprofundado',     color: 'cat-blue' },
    mapa:                 { label: 'Mapa',                   color: 'cat-dark' }
}
```

- [ ] **Step 3: Commit**

```bash
git add data/index.json js/data.js
git commit -m "feat(data): update index.json + CONFIG.cats for new 4-tab structure

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Atualizar js/state.js — novos campos

**Files:**
- Modify: `js/state.js`

- [ ] **Step 1: Adicionar `activeSubAba` e `tabStructure` em STATE**

Localizar (linha 2):
```javascript
let STATE = {
    activeTab: 'fundamentos', // Default tab
```

Substituir o bloco inteiro `let STATE = { ... };` por (manter todos os campos existentes, adicionar 2 novos):
```javascript
let STATE = {
    activeTab: 'fundamentos',
    activeSubAba: null,       // ID da sub-aba ativa (null = todas)
    tabStructure: {},         // { [tabId]: full tab JSON para hero/chips/categorias }
    activeLetter: '',
    activeCategory: '',
    activeTags: [],
    activeCategories: [],
    activeSources: [],
    activeFocusPoints: [],
    activeSubject: null,
    bodyFilter: null,
    apostilas: {
        ensinamentos: { items: [], title: "Minha Apostila" },
        explicacoes: { items: [], title: "Meus Estudos" }
    },
    mode: 'ensinamentos',
    list: [],
    idx: -1,
    isCrossTabMode: false,
    selectedBodyPoint: null,
    globalData: {},
    data: {},
    readingHistory: []
};
```

- [ ] **Step 2: Commit**

```bash
git add js/state.js
git commit -m "feat(state): add activeSubAba + tabStructure fields

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Atualizar js/core.js — carregamento das novas tabs

**Files:**
- Modify: `js/core.js`

- [ ] **Step 1: Adicionar `loadTabData` e `flattenTabData` antes de `loadData()`**

No topo de `core.js`, antes da linha `async function loadData()`, inserir:

```javascript
// IDs das tabs que usam o novo schema tab_<id>.json
const NEW_TAB_IDS = ['fundamentos', 'como_aplicar', 'critica_farmacologia', 'por_condicao'];

async function loadTabData(tabId) {
    const res = await fetch(`data/tab_${tabId}.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Erro ao carregar tab_${tabId}.json: ${res.status}`);
    return await res.json();
}

// Achata estrutura hierárquica em lista plana compatível com renderList
function flattenTabData(tabData) {
    const items = [];
    tabData.sub_abas.forEach(subAba => {
        subAba.categorias.forEach(cat => {
            cat.artigos.forEach(artigo => {
                items.push({
                    ...artigo,
                    // Aliases para compatibilidade com modal e renderList existentes
                    title_pt:          artigo.titulo,
                    content_pt:        artigo.conteudo,
                    _cat:              tabData.id,
                    _subAbaId:         subAba.id,
                    _subAbaTitulo:     subAba.titulo,
                    _categoriaTitulo:  cat.titulo,
                });
            });
        });
    });
    return items;
}
```

- [ ] **Step 2: Substituir o corpo de `loadData()` para usar novo schema**

Localizar a função `async function loadData()` e substituir seu corpo por:

```javascript
async function loadData() {
    try {
        const idxRes = await fetch(`data/index.json?t=${Date.now()}`);
        const idxData = await idxRes.json();

        STATE.data = {};
        STATE.tabStructure = {};

        // Carrega tabs do novo schema (tab_<id>.json)
        await Promise.all(
            idxData.tabs
                .filter(tab => tab.file && NEW_TAB_IDS.includes(tab.id))
                .map(async tab => {
                    const tabData = await loadTabData(tab.id);
                    STATE.tabStructure[tab.id] = tabData;
                    STATE.data[tab.id] = flattenTabData(tabData);
                })
        );

        // Estudo Aprofundado: mantém carregamento existente por categorias
        // (se index.json tiver categories para essa tab, carregar aqui)
        if (idxData.categories) {
            await Promise.all(idxData.categories.map(async category => {
                const tabId = category.tab;
                if (NEW_TAB_IDS.includes(tabId)) return; // já carregado acima
                await Promise.all(category.volumes.map(async volInfo => {
                    const res = await fetch(`data/${volInfo.file}?t=${Date.now()}`);
                    const items = await res.json();
                    if (!STATE.data[tabId]) STATE.data[tabId] = [];
                    const valid = items.filter(i => (i.title_pt || i.title)?.trim());
                    STATE.data[tabId].push(...valid.map(i => ({ ...i, _cat: tabId })));
                }));
            }));
        }

        // Popula cache global por ID
        STATE.globalData = {};
        Object.entries(STATE.data).forEach(([tabId, items]) => {
            items.forEach(item => {
                if (item?.id) STATE.globalData[item.id] = { ...item, _cat: tabId };
            });
        });

        if (!STATE.activeTab || !STATE.data[STATE.activeTab]) {
            STATE.activeTab = 'fundamentos';
        }

        console.log('Tabs carregadas:', Object.keys(STATE.data).map(k => `${k}:${STATE.data[k].length}`));

        renderTabs();
        renderAlphabet();
        applyFilters();

        if (typeof populateCategoryDropdown === 'function') populateCategoryDropdown();
        if (typeof populateSourceDropdown === 'function') populateSourceDropdown();
        if (typeof initializeTagBrowser === 'function') initializeTagBrowser();
        if (STATE.activeTab === 'mapa') setTimeout(renderBodyMaps, 100);

        checkUrlForDeepLink();

    } catch (e) {
        console.error('Erro loadData:', e);
    }
}
```

- [ ] **Step 3: Resetar activeSubAba ao mudar de tab**

Na função `setTab(id)` (linha ~239), após `STATE.activeTab = id;`, adicionar:
```javascript
STATE.activeSubAba = null;   // Reset sub-aba filter on tab change
```

- [ ] **Step 4: Commit**

```bash
git add js/core.js
git commit -m "feat(core): loadTabData + flattenTabData, new loadData para novo schema

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Remover bilíngue do index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Remover bloco de estilos `.lang-toggle-btn`**

Localizar e deletar o bloco completo (linhas ~48-74):
```html
/* Language Toggle Styles */
.lang-toggle-btn { ... }
.lang-toggle-btn.active { ... }
.dark .lang-toggle-btn.active { ... }
.lang-toggle-btn:hover:not(.active) { ... }
.dark .lang-toggle-btn:hover:not(.active) { ... }
```

- [ ] **Step 2: Remover os 3 botões de toggle de idioma**

Localizar o container que contém os 3 botões `lang-toggle-btn` (Português / Original JP / Comparar, linhas ~694-720) e deletar o container inteiro (incluindo o `<div class="flex flex-col gap-1 bg-gray-50...">` pai).

- [ ] **Step 3: Remover #contentJP**

Localizar e deletar:
```html
<div id="contentJP"
    class="content-view hidden rich-text font-serif leading-loose text-gray-800 dark:text-gray-200">
</div>
```

- [ ] **Step 4: Remover #contentCompare e seus filhos**

Localizar e deletar o bloco completo:
```html
<div id="contentCompare" class="content-view hidden">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        ...
        <div id="contentComparePT" ...></div>
        ...
        <div id="contentCompareJP" ...></div>
    </div>
</div>
```

- [ ] **Step 5: Adicionar #modalFonte após #modalTitle**

Localizar:
```html
<h2 id="modalTitle"
    class="text-3xl md:text-4xl font-serif font-medium mb-8 md:mb-12 leading-[1.2] text-black dark:text-white text-center">
</h2>
```

Adicionar logo após:
```html
<p id="modalFonte"
   class="text-sm text-gray-400 dark:text-gray-500 italic text-center -mt-6 mb-8">
</p>
```

- [ ] **Step 6: Adicionar #subAbaChipsContainer antes de #contentList**

Localizar:
```html
<div id="contentList"
    class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 lg:gap-8 pt-4 md:pt-8 w-full max-w-7xl mx-auto">
</div>
```

Adicionar ANTES:
```html
<div id="heroContainer" class="w-full max-w-7xl mx-auto px-0"></div>
<div id="subAbaChipsContainer" class="w-full max-w-7xl mx-auto"></div>
```

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(html): remover UI bilíngue, adicionar #heroContainer #subAbaChipsContainer #modalFonte

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Simplificar js/modal.js

**Files:**
- Modify: `js/modal.js`

- [ ] **Step 1: Remover `switchLanguageView` e `STATE.languageView`**

Localizar e deletar:
```javascript
STATE.languageView = localStorage.getItem('languageView') || 'pt';
```

Localizar e deletar a função completa `window.switchLanguageView = function(mode) { ... }` (linhas ~25-54).

- [ ] **Step 2: Simplificar `applyReadingSettings` para remover refs a contentJP/Compare**

Localizar em `applyReadingSettings()`:
```javascript
const allContainers = [
    document.getElementById('contentPT'),
    document.getElementById('contentJP'),
    document.getElementById('contentComparePT'),
    document.getElementById('contentCompareJP')
];
```

Substituir por:
```javascript
const allContainers = [
    document.getElementById('contentPT'),
];
```

- [ ] **Step 3: Atualizar lógica de título em `openModal()` para usar `artigo.titulo`**

Localizar:
```javascript
const rawTitle = item.title_pt || item.title_jp || item.title || item.id;
```

Substituir por:
```javascript
const rawTitle = item.title_pt || item.titulo || item.title || item.id;
```

- [ ] **Step 4: Exibir `fonte` em #modalFonte**

Logo após:
```javascript
document.getElementById('modalTitle').textContent = displayTitle;
```

Adicionar:
```javascript
const fonteEl = document.getElementById('modalFonte');
if (fonteEl) {
    fonteEl.textContent = item.fonte || item.info_pt || '';
}
```

- [ ] **Step 5: Atualizar renderização de conteúdo para usar `item.conteudo`**

Localizar o bloco que atribui `pt` e `jp` e substituir tudo por apenas:
```javascript
const pt = item.content_pt || item.conteudo || '';
```

Depois, localizar e **deletar** estas 3 linhas específicas:
```javascript
document.getElementById('contentJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);
document.getElementById('contentComparePT').innerHTML = formatBodyText(pt, effectiveQuery, item.focusPoints) + infoHtml;
document.getElementById('contentCompareJP').innerHTML = formatBodyText(jp, effectiveQuery, item.focusPoints);
```

Localizar o array `contentViews` que inclui `contentJP`/`contentComparePT`/`contentCompareJP` e reduzir para apenas:
```javascript
const contentViews = [document.getElementById('contentPT')];
```

Localizar e deletar o bloco:
```javascript
let contentContainer = document.getElementById('contentPT');
if (STATE.languageView === 'compare') {
    contentContainer = document.getElementById('contentComparePT');
}
```
Substituir por:
```javascript
const contentContainer = document.getElementById('contentPT');
```

- [ ] **Step 6: Garantir que `contentPT` seja sempre visível**

Localizar onde o modal é aberto e remover qualquer chamada a `switchLanguageView(...)`. Garantir que `document.getElementById('contentPT')` não tenha a classe `hidden`.

- [ ] **Step 7: Commit**

```bash
git add js/modal.js
git commit -m "feat(modal): remover bilíngue, sempre PT, exibir fonte

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Atualizar js/ui-renderer.js — hero, sub-aba chips e renderTabs

**Files:**
- Modify: `js/ui-renderer.js`

- [ ] **Step 1: Adicionar funções de renderização antes de `renderTabs()`**

No início de `js/ui-renderer.js`, antes da linha `function updateMapLayout`, inserir:

```javascript
function renderHero(heroText) {
    if (!heroText) return '';
    return `<blockquote class="hero-block font-serif text-base italic
                text-gray-600 dark:text-gray-300
                border-l-4 border-yellow-600 pl-5 py-3 mb-4 leading-relaxed">
        ${heroText.replace(/\n/g, '<br>')}
    </blockquote>`;
}

function renderSubAbaChips(subAbas, activeId) {
    // Only render chips if there are real sub-abas with titles
    const real = subAbas.filter(s => s.titulo);
    if (real.length === 0) return '';
    const chips = real.map(s => {
        const isActive = s.id === activeId;
        const cls = isActive
            ? 'border-black dark:border-white text-black dark:text-white font-bold'
            : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-black dark:hover:text-white';
        return `<button onclick="setSubAbaFilter('${s.id}')"
            class="sub-aba-chip text-[10px] uppercase tracking-widest pb-1.5
                   border-b-2 transition-all whitespace-nowrap flex-shrink-0 ${cls}">
            ${s.titulo}
        </button>`;
    }).join('');
    return `<div class="sub-aba-chips flex gap-6 overflow-x-auto pb-1 mb-6
                        border-b border-gray-100 dark:border-gray-800">
        ${chips}
    </div>`;
}

function updateHeroAndChips() {
    const tabData = STATE.tabStructure?.[STATE.activeTab];
    if (!tabData) {
        // Tab sem novo schema (estudo_aprofundado, mapa) — limpar containers
        const hc = document.getElementById('heroContainer');
        const sc = document.getElementById('subAbaChipsContainer');
        if (hc) hc.innerHTML = '';
        if (sc) sc.innerHTML = '';
        return;
    }

    // Hero: tab-level hero OR hero da sub-aba ativa
    const activeSubAbaData = STATE.activeSubAba
        ? tabData.sub_abas.find(s => s.id === STATE.activeSubAba)
        : null;
    const heroText = (activeSubAbaData?.hero) || tabData.hero || '';
    const hc = document.getElementById('heroContainer');
    if (hc) hc.innerHTML = renderHero(heroText);

    // Sub-aba chips
    const sc = document.getElementById('subAbaChipsContainer');
    if (sc) sc.innerHTML = renderSubAbaChips(tabData.sub_abas, STATE.activeSubAba);
}
```

- [ ] **Step 2: Chamar `updateHeroAndChips()` dentro de `renderTabs()`**

Na função `renderTabs()`, no final (após `container.innerHTML = html;` e antes do fechamento), adicionar:
```javascript
updateHeroAndChips();
```

- [ ] **Step 3: Commit**

```bash
git add js/ui-renderer.js
git commit -m "feat(ui): hero block, sub-aba chips, updateHeroAndChips

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Atualizar js/ui.js — cabeçalhos de categoria na lista

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Adicionar helper `renderCategoriaHeader`**

Antes da função `renderList()` (linha 221), inserir:

```javascript
function renderCategoriaHeader(titulo) {
    return `<div class="col-span-full categoria-header
                text-[10px] uppercase tracking-widest text-gray-400
                pt-6 pb-2 border-b border-gray-100 dark:border-gray-800 mb-1">
        ${titulo}
    </div>`;
}
```

- [ ] **Step 2: Injetar cabeçalhos de categoria na `renderList()`**

Dentro de `renderList()`, substituir a linha:
```javascript
el.innerHTML = list.map((item, i) => {
```

Por:
```javascript
// Agrupar por _categoriaTitulo para injetar cabeçalhos separadores
const tabData = STATE.tabStructure?.[activeTab];
const showCategHeaders = !!tabData;

let lastCategoria = '__NONE__';
el.innerHTML = list.map((item, i) => {
    let headerHtml = '';
    if (showCategHeaders && item._categoriaTitulo && item._categoriaTitulo !== lastCategoria) {
        lastCategoria = item._categoriaTitulo;
        headerHtml = renderCategoriaHeader(item._categoriaTitulo);
    }
    return headerHtml + (() => {
```

E fechar o IIFE no final do `.map()` callback:
```javascript
    })();
```

Observação: isso é um wrapper. Na prática, a transformação mais simples é:

Substituir o `el.innerHTML = list.map((item, i) => { ... }).join('');` por:

```javascript
const tabData = STATE.tabStructure?.[activeTab];
const showCategHeaders = !!tabData;
let lastCategoria = '__NONE__';

const rows = [];
list.forEach((item, i) => {
    // Inject categoria header when group changes
    if (showCategHeaders && item._categoriaTitulo && item._categoriaTitulo !== lastCategoria) {
        lastCategoria = item._categoriaTitulo;
        rows.push(renderCategoriaHeader(item._categoriaTitulo));
    }
    rows.push(buildCardHtml(item, i, activeTags, mode));
});
el.innerHTML = rows.join('');
```

E extrair o HTML de cada card para uma função `buildCardHtml(item, i, activeTags, mode)`:

```javascript
function buildCardHtml(item, i, activeTags, mode) {
    const catConfig = CONFIG.modes[mode].cats[item._cat];
    const currentApostila = STATE.apostilas ? STATE.apostilas[STATE.mode] : null;
    const isInApostila = currentApostila && currentApostila.items.includes(item.id);
    const catColorHex = { 'cat-blue': '#2C5F8D', 'cat-green': '#4A7C59', 'cat-purple': '#8B5A8E', 'cat-dark': '#1c1917' };
    const catColor = catColorHex[catConfig?.color] || 'var(--n-muted)';
    // No tags for new tabs (tags array will be empty)
    const allTags = [...(item.tags || []), ...(item.focusPoints || [])].slice(0, 6);
    const tagsHtml = allTags.length === 0 ? '' :
        `<div class="ci-tags">${allTags.map((t, idx) =>
            (idx > 0 ? '<span class="ci-dot">·</span>' : '') +
            `<button onclick="filterByTag('${t.replace(/'/g, "\\'")}', event)"
                class="ci-tag${activeTags?.includes(t) ? ' is-active' : ''}">${t}</button>`
        ).join('')}</div>`;

    return `
    <article id="card-${i}" onclick="openModal(${i})" class="card-item cursor-pointer group">
        <div class="ci-header">
            <span class="ci-cat" style="color:${catColor}">${catConfig ? catConfig.label : item._cat}</span>
            <div class="ci-actions">
                <button onclick="event.stopPropagation(); toggleApostilaItem('${item.id}', this)"
                    class="ci-save${isInApostila ? ' text-yellow-600' : ''}"
                    title="Adicionar à Apostila">
                    <svg width="14" height="14" fill="${isInApostila ? 'currentColor' : 'none'}"
                        stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                    </svg>
                </button>
                <span class="ci-arrow">›</span>
            </div>
        </div>
        <h3 class="ci-title font-serif">${typeof cleanTitle === 'function'
            ? cleanTitle(item.title_pt || item.titulo || item.title || '')
            : (item.title_pt || item.titulo || item.title || '')}</h3>
        ${tagsHtml}
    </article>`;
}
```

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat(ui): categoria headers in renderList, extract buildCardHtml

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Atualizar js/filters.js — filtro por sub-aba

**Files:**
- Modify: `js/filters.js`

- [ ] **Step 1: Adicionar `setSubAbaFilter()`**

No início de `filters.js`, após a primeira função, adicionar:

```javascript
function setSubAbaFilter(subAbaId) {
    // Toggle: clicar no ativo desmarca
    STATE.activeSubAba = (subAbaId === STATE.activeSubAba) ? null : subAbaId;
    applyFilters();
    // Re-render chips para refletir novo estado ativo
    if (typeof updateHeroAndChips === 'function') updateHeroAndChips();
}
```

- [ ] **Step 2: Adicionar condição de sub-aba em `applyFilters()`**

Dentro da função `applyFilters()` (linha ~328), localizar o início do `.filter()` que processa cada item. Antes de qualquer outro `return false`, adicionar:

```javascript
// Filtro por sub-aba (tabs com novo schema)
if (STATE.activeSubAba && item._subAbaId) {
    if (item._subAbaId !== STATE.activeSubAba) return false;
}
```

- [ ] **Step 3: Commit**

```bash
git add js/filters.js
git commit -m "feat(filters): sub-aba filter — setSubAbaFilter + applyFilters condition

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Limpar CSS bilíngue em css/volume-modal.css

**Files:**
- Modify: `css/volume-modal.css`

- [ ] **Step 1: Comentar regras `.vm-parallel*` e `.dm-cmp*`**

Localizar e envolver em `/* REMOVED: bilingual layout` ... `*/` cada um destes blocos:
- `.vm-parallel { ... }`
- `.vm-parallel-row { ... }`
- `.vm-parallel-pt { ... }`
- `.vm-parallel-jp { ... }`
- `.dm-cmp-pt { ... }`
- `.dm-cmp-jp { ... }`
- `.dm-cmp-letter { ... }`
- `.dm-cmp-source { ... }`
- Qualquer bloco `@media` que só contenha regras dos itens acima

- [ ] **Step 2: Adicionar CSS para novos componentes no final do arquivo**

```css
/* ── Sub-aba chips ─────────────────────────────────────────── */
.sub-aba-chips { scrollbar-width: none; }
.sub-aba-chips::-webkit-scrollbar { display: none; }

/* ── Hero block ─────────────────────────────────────────────── */
.hero-block { background: rgba(184,134,11,0.04); border-radius: 0 4px 4px 0; }
.dark .hero-block { background: rgba(184,134,11,0.08); }

/* ── Categoria header divider ──────────────────────────────── */
.categoria-header { font-family: 'Outfit', sans-serif; }
```

- [ ] **Step 3: Commit**

```bash
git add css/volume-modal.css
git commit -m "style: comentar CSS bilíngue, adicionar estilos sub-aba/hero/categoria

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Verificação no browser

- [ ] **Step 1: Iniciar servidor local**

```bash
python -m http.server 8004
```

Abrir `http://localhost:8004` no browser.

- [ ] **Step 2: Verificar tab Fundamentos**

- Lista de artigos carrega (sem erro no console)
- Não há chips de sub-aba (Fundamentos não tem sub-abas)
- Clicar num artigo abre o modal
- Modal mostra apenas texto PT (sem toggle JP/Comparar)
- Campo `#modalFonte` mostra a citação em itálico

- [ ] **Step 3: Verificar tab Por Condição**

- Chips de sub-aba visíveis (Tuberculose, Asma, etc.)
- Clicar num chip filtra a lista para artigos daquela sub-aba
- Cabeçalhos de categoria (Categoria I, II) aparecem como separadores na lista
- Clicar no chip ativo desmarca e mostra todos

- [ ] **Step 4: Verificar tab Como Aplicar**

- Hero text aparece (blockquote com borda amarela) acima da lista
- Cabeçalhos das seções romanas (I. O Objetivo..., II. Formas...) aparecem na lista

- [ ] **Step 5: Verificar Estudo Aprofundado e Mapa**

- Essas duas tabs continuam funcionando como antes
- `#heroContainer` e `#subAbaChipsContainer` ficam vazios nessas tabs

- [ ] **Step 6: Verificar console do browser**

Abrir DevTools → Console. Deve mostrar:
```
Tabs carregadas: fundamentos:N, como_aplicar:N, critica_farmacologia:N, por_condicao:N
```
Sem erros de 404 ou TypeError.

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat: PT-only + estrutura MD_PT_v4 completa

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
