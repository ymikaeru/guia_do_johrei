# Essência — Destaque Editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um card "Essência" curado pelo admin no topo de todas as abas do site `guia_johrei`, gerenciado via aba nova no `admin-supabase.html` do projeto `caminho_da_felicidade` e persistido em uma linha singleton no Supabase.

**Architecture:** Tabela Supabase `johrei_essencia` (1 linha, RLS pública pra leitura, admin pra escrita) é a fonte da verdade. Site faz fetch público no load via REST PostgREST e renderiza um card com título + trecho + botão "Ler completo" que abre o modal existente. Admin tem nova aba que lê um `data/admin_index.json` leve (~150KB) gerado por script Python no `guia_johrei` para popular um autocomplete de seleção.

**Tech Stack:** Vanilla JS no site, Supabase JS client no admin (já presente), PostgreSQL/RLS no backend, Python stdlib pra script de build.

**Spec:** [docs/superpowers/specs/2026-04-27-essencia-destaque-design.md](../specs/2026-04-27-essencia-destaque-design.md)

**Configuração conhecida:**
- Supabase URL: `https://succhmnbajvbpmoqrktq.supabase.co`
- Anon key: presente em `caminho_da_felicidade/js/supabase-config.js` (pública por design)
- RLS pattern: usa função `public.is_admin()` (definida em `restore_admin_and_rls.sql`)

---

## File Structure

| Arquivo | Status | Responsabilidade |
|---|---|---|
| `caminho_da_felicidade/supabase/migrations/johrei_essencia.sql` | Create | Schema da tabela + RLS |
| `guia_johrei/scripts/migration/build_admin_index.py` | Create | Gera índice leve de títulos pro admin |
| `guia_johrei/data/admin_index.json` | Create (gerado) | Saída do script acima |
| `guia_johrei/js/essencia.js` | Create | `renderEssencia()` + collapse handling |
| `guia_johrei/style.css` | Modify | Estilos do card `#essenciaCard` |
| `guia_johrei/js/state.js` | Modify | `STATE.essencia`, `STATE.essenciaCollapsed` |
| `guia_johrei/js/core.js` | Modify | Fetch da curadoria em `loadData` + chamada a `renderEssencia` |
| `guia_johrei/index.html` | Modify | `<script src="js/essencia.js">` + bumps de versão |
| `caminho_da_felicidade/admin-supabase.html` | Modify | Aba "📌 Essência (Guia)" com UI completa |

---

## Task 1: Supabase migration — tabela `johrei_essencia` com RLS

**Files:**
- Create: `caminho_da_felicidade/supabase/migrations/johrei_essencia.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- caminho_da_felicidade/supabase/migrations/johrei_essencia.sql
-- Singleton table holding the current "Essência" featured teaching for guia_johrei.

create table if not exists public.johrei_essencia (
    id          smallint primary key default 1 check (id = 1),
    article_id  text not null,
    excerpt_pt  text not null,
    updated_at  timestamptz not null default now(),
    updated_by  uuid references auth.users(id)
);

alter table public.johrei_essencia enable row level security;

-- Leitura pública (anon role) para o site guia_johrei
drop policy if exists "anon read essencia" on public.johrei_essencia;
create policy "anon read essencia"
    on public.johrei_essencia
    for select
    to anon
    using (true);

-- Leitura também pra usuários autenticados (admin precisa ler pra editar)
drop policy if exists "auth read essencia" on public.johrei_essencia;
create policy "auth read essencia"
    on public.johrei_essencia
    for select
    to authenticated
    using (true);

-- Escrita só para admin (mesmo padrão das outras tabelas)
drop policy if exists "admin write essencia" on public.johrei_essencia;
create policy "admin write essencia"
    on public.johrei_essencia
    for all
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- Trigger para atualizar updated_at automaticamente
create or replace function public.touch_johrei_essencia()
returns trigger as $$
begin
    new.updated_at = now();
    new.updated_by = auth.uid();
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_johrei_essencia on public.johrei_essencia;
create trigger trg_touch_johrei_essencia
    before insert or update on public.johrei_essencia
    for each row execute function public.touch_johrei_essencia();
```

- [ ] **Step 2: Aplicar migration no Supabase**

Pelo dashboard do Supabase: SQL Editor → cola o conteúdo → Run. Ou via CLI se estiver configurado:

```bash
cd C:/Mioshie_Sites/caminho_da_felicidade
supabase db push
```

Verifica que a tabela foi criada:

```sql
select * from public.johrei_essencia;
-- Esperado: 0 linhas, sem erro
```

- [ ] **Step 3: Verificar políticas RLS funcionam**

Como anon (sem login), via SQL Editor com `set role anon`:

```sql
set role anon;
insert into public.johrei_essencia (article_id, excerpt_pt) values ('test', 'test');
-- Esperado: erro de RLS "new row violates row-level security policy"
reset role;
```

E como anon a leitura funciona:

```sql
set role anon;
select * from public.johrei_essencia;
-- Esperado: vazio, sem erro
reset role;
```

- [ ] **Step 4: Commit**

```bash
cd C:/Mioshie_Sites/caminho_da_felicidade
git add supabase/migrations/johrei_essencia.sql
git commit -m "feat(supabase): add johrei_essencia singleton table with RLS

Holds the current featured teaching for the guia_johrei site.
Anon read, admin write via is_admin() function."
```

---

## Task 2: Script `build_admin_index.py` + commit `data/admin_index.json`

**Files:**
- Create: `guia_johrei/scripts/migration/build_admin_index.py`
- Create (output): `guia_johrei/data/admin_index.json`

- [ ] **Step 1: Criar o script**

```python
#!/usr/bin/env python3
"""
build_admin_index.py — gera data/admin_index.json com índice leve dos artigos.

Usado pelo admin no caminho_da_felicidade pra popular o autocomplete de
seleção do destaque "Essência". Inclui só id, título, aba final (após
tab_overrides) e fonte amigável.

Roda manualmente quando conteúdo do site muda. Saída ~150KB.
"""
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[2]
DATA = ROOT / 'data'

# Mesma lógica de fallback do core.js#loadData
SOURCE_TAB_TO_FALLBACK = {
    'fundamentos':   'fundamentos',
    'cases_qa':      'por_condicao',
    'pontos_focais': 'por_regiao',
}

def load_index():
    with open(DATA / 'index.json', encoding='utf-8') as f:
        return json.load(f)

def load_overrides():
    path = DATA / 'tab_overrides.json'
    if not path.exists():
        return {}
    with open(path, encoding='utf-8') as f:
        d = json.load(f)
    return d.get('overrides', {})

def vol_label(vol_key: str) -> str:
    """johrei_vol01 -> Johrei Hô Kohza Vol.01"""
    if vol_key.startswith('johrei_vol'):
        n = vol_key.replace('johrei_vol', '').lstrip('0') or '0'
        return f'Johrei Hô Kohza Vol.{int(n):02d}'
    if vol_key.startswith('pontos_focais_vol'):
        n = vol_key.replace('pontos_focais_vol', '').lstrip('0') or '0'
        return f'Pontos Focais Vol.{int(n):02d}'
    if vol_key.startswith('estudo_aprofundado'):
        return 'Estudo Aprofundado'
    return vol_key

def main():
    idx = load_index()
    overrides = load_overrides()
    out = []

    # idx['categories'] tem itens com {tab, volumes:[{file:...}]}
    # Estudo Aprofundado fica intacto; demais tabs passam por overrides.
    for category in idx.get('categories', []):
        src_tab = category.get('tab')
        for vol in category.get('volumes', []):
            file_name = vol['file']
            source_key = file_name.replace('_bilingual.json', '').replace('_site.json', '')
            file_path = DATA / file_name
            if not file_path.exists():
                continue
            with open(file_path, encoding='utf-8') as f:
                items = json.load(f)
            if not isinstance(items, list):
                continue
            for orig_idx, art in enumerate(items):
                article_id = art.get('id')
                title = art.get('title_pt') or art.get('title') or ''
                if not article_id or not title.strip():
                    continue
                # Resolver aba final
                if src_tab == 'estudo_aprofundado':
                    final_tab = 'estudo_aprofundado'
                else:
                    override_key = f'{source_key}:{orig_idx}'
                    final_tab = overrides.get(override_key) or SOURCE_TAB_TO_FALLBACK.get(src_tab, src_tab)
                out.append({
                    'id': article_id,
                    'title': title.strip(),
                    'tab': final_tab,
                    'source': vol_label(source_key),
                })

    out_path = DATA / 'admin_index.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size_kb = out_path.stat().st_size / 1024
    print(f'  {len(out)} artigos -> {out_path}  ({size_kb:.1f} KB)')

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Rodar e verificar saída**

```bash
cd C:/Mioshie_Sites/guia_johrei
python scripts/migration/build_admin_index.py
```

Esperado: `1300+ artigos -> .../data/admin_index.json  (~150 KB)`

- [ ] **Step 3: Validar conteúdo do arquivo gerado**

```bash
cd C:/Mioshie_Sites/guia_johrei
python -c "
import json
with open('data/admin_index.json', encoding='utf-8') as f:
    d = json.load(f)
print(f'Total: {len(d)}')
print('Sample:', json.dumps(d[0], ensure_ascii=False))
print('Tabs:', set(x['tab'] for x in d))
"
```

Esperado: total >1300, sample mostra `{id, title, tab, source}`, set de tabs inclui `fundamentos`, `como_aplicar`, `por_condicao`, `por_regiao`, `estudo_aprofundado`.

- [ ] **Step 4: Atualizar `CLAUDE.md` na seção "Comandos úteis"**

Adicionar a linha do novo script junto às outras migrações. Buscar a seção `# Re-rodar todas as migrações de dados` e adicionar:

```bash
python build_admin_index.py
```

Imediatamente antes da linha `python build_guide_precise.py`.

- [ ] **Step 5: Commit**

```bash
cd C:/Mioshie_Sites/guia_johrei
git add scripts/migration/build_admin_index.py data/admin_index.json CLAUDE.md
git commit -m "feat: add admin_index.json builder for Essência admin tab

Lightweight (~150KB) catalog of all teachings with id, title, final tab
(post-overrides) and source label. Consumed by the new Essência tab in
caminho_da_felicidade admin to populate the article autocomplete."
```

---

## Task 3: Estilos CSS do card `#essenciaCard`

**Files:**
- Modify: `guia_johrei/style.css` (append at end of file)

- [ ] **Step 1: Adicionar bloco de estilos no fim de `style.css`**

Localizar fim de `style.css` e adicionar:

```css
/* === Essência — destaque editorial =================================== */
#essenciaCard {
    margin: 12px auto 16px;
    max-width: 1100px;
    padding: 18px 22px;
    background: linear-gradient(180deg, rgba(218, 165, 32, 0.06) 0%, rgba(218, 165, 32, 0.02) 100%);
    border: 1px solid rgba(218, 165, 32, 0.35);
    border-radius: 10px;
    position: relative;
    transition: padding 0.2s ease;
}
.dark #essenciaCard {
    background: linear-gradient(180deg, rgba(218, 165, 32, 0.10) 0%, rgba(218, 165, 32, 0.03) 100%);
    border-color: rgba(218, 165, 32, 0.45);
}
#essenciaCard.collapsed {
    padding: 8px 16px;
}
#essenciaCard .essencia-label {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #b8860b;
    font-weight: 700;
    margin-bottom: 6px;
}
.dark #essenciaCard .essencia-label { color: #d4a843; }
#essenciaCard .essencia-title {
    font-size: 18px;
    font-weight: 600;
    margin: 4px 0 8px;
    line-height: 1.3;
}
#essenciaCard .essencia-excerpt {
    font-size: 14px;
    line-height: 1.55;
    color: var(--text-color, #333);
    margin-bottom: 12px;
    white-space: pre-wrap;
}
.dark #essenciaCard .essencia-excerpt { color: #ccc; }
#essenciaCard .essencia-actions {
    display: flex;
    justify-content: flex-end;
}
#essenciaCard .essencia-cta {
    background: transparent;
    border: 1px solid rgba(218, 165, 32, 0.55);
    color: #b8860b;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
}
#essenciaCard .essencia-cta:hover {
    background: rgba(218, 165, 32, 0.12);
}
.dark #essenciaCard .essencia-cta { color: #d4a843; }
#essenciaCard .essencia-toggle {
    position: absolute;
    top: 8px;
    right: 10px;
    background: transparent;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #999;
    width: 28px;
    height: 28px;
    line-height: 1;
    border-radius: 4px;
}
#essenciaCard .essencia-toggle:hover {
    background: rgba(0,0,0,0.05);
    color: #555;
}
.dark #essenciaCard .essencia-toggle:hover { background: rgba(255,255,255,0.08); color: #ccc; }
#essenciaCard.collapsed .essencia-title,
#essenciaCard.collapsed .essencia-excerpt,
#essenciaCard.collapsed .essencia-actions {
    display: none;
}
#essenciaCard.collapsed .essencia-collapsed-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-right: 32px;
}
#essenciaCard:not(.collapsed) .essencia-collapsed-row {
    display: none;
}
#essenciaCard.collapsed .essencia-collapsed-row .label {
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #b8860b;
    font-weight: 700;
    flex-shrink: 0;
}
#essenciaCard.collapsed .essencia-collapsed-row .title {
    font-size: 13px;
    color: var(--text-color, #333);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}
#essenciaCard.collapsed .essencia-collapsed-row .title:hover { text-decoration: underline; }
.dark #essenciaCard.collapsed .essencia-collapsed-row .title { color: #ccc; }

@media (max-width: 640px) {
    #essenciaCard {
        margin: 10px 12px 12px;
        padding: 14px 16px;
    }
    #essenciaCard .essencia-title { font-size: 16px; }
    #essenciaCard .essencia-excerpt { font-size: 13px; }
}
```

- [ ] **Step 2: Verificar visualmente que o CSS é válido**

Abrir o site no preview server, abrir DevTools, console: sem erros de CSS. Sem mudança visual ainda (o elemento `#essenciaCard` não existe no HTML).

- [ ] **Step 3: Commit**

```bash
cd C:/Mioshie_Sites/guia_johrei
git add style.css
git commit -m "feat(essencia): add CSS for featured-teaching card

Card styles for #essenciaCard with light/dark variants, collapsed mode,
and mobile breakpoint. No HTML wired yet."
```

---

## Task 4: `js/essencia.js` — função `renderEssencia()` e toggle

**Files:**
- Create: `guia_johrei/js/essencia.js`
- Modify: `guia_johrei/js/state.js`

- [ ] **Step 1: Adicionar campo de estado em `state.js`**

Localizar onde `STATE` é declarado em `js/state.js` e adicionar dois campos no objeto:

```javascript
// Buscar a definição de STATE e adicionar:
//   essencia: null,            // { article_id, excerpt_pt, updated_at } ou null
//   essenciaCollapsed: false,  // estado em memória (só durante a sessão)
```

Os outros campos seguem a mesma forma de assignment já presente.

- [ ] **Step 2: Criar `js/essencia.js`**

```javascript
// js/essencia.js — renderiza o card "Essência" no topo do site.
// Estado em STATE.essencia (objeto Supabase) e STATE.essenciaCollapsed (bool).

(function () {
    'use strict';

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function findHostElement() {
        // Inserir antes da tab bar; fallback: antes do main content.
        return document.getElementById('tabBar')
            || document.querySelector('nav')
            || document.querySelector('main')
            || document.body.firstElementChild;
    }

    function ensureCardElement() {
        let card = document.getElementById('essenciaCard');
        if (card) return card;
        card = document.createElement('section');
        card.id = 'essenciaCard';
        card.setAttribute('aria-label', 'Ensinamento em destaque');
        const host = findHostElement();
        if (host && host.parentNode) {
            host.parentNode.insertBefore(card, host);
        } else {
            document.body.insertBefore(card, document.body.firstChild);
        }
        return card;
    }

    function removeCard() {
        const card = document.getElementById('essenciaCard');
        if (card) card.remove();
    }

    function resolveItem() {
        const e = STATE.essencia;
        if (!e || !e.article_id) return null;
        if (!STATE.globalData) return null;
        return STATE.globalData[e.article_id] || null;
    }

    function buildHtml(item, excerpt, collapsed) {
        const cleanT = typeof cleanTitle === 'function' ? cleanTitle : (s => s);
        const title = escapeHtml(cleanT(item.title_pt || item.title || ''));
        const exc = escapeHtml(excerpt || '');
        const expanded = `
            <div class="essencia-label">Essência</div>
            <h2 class="essencia-title">${title}</h2>
            <div class="essencia-excerpt">${exc}</div>
            <div class="essencia-actions">
                <button type="button" class="essencia-cta" data-essencia-action="open">Ler completo →</button>
            </div>
            <button type="button" class="essencia-toggle" data-essencia-action="collapse" aria-label="Encolher">—</button>
        `;
        const collapsedRow = `
            <div class="essencia-collapsed-row">
                <span class="label">Essência:</span>
                <span class="title" data-essencia-action="open">${title}</span>
            </div>
            <button type="button" class="essencia-toggle" data-essencia-action="expand" aria-label="Expandir">+</button>
        `;
        return collapsed ? collapsedRow : expanded;
    }

    function attachHandlers(card, item) {
        card.addEventListener('click', function (ev) {
            const target = ev.target.closest('[data-essencia-action]');
            if (!target) return;
            const action = target.getAttribute('data-essencia-action');
            if (action === 'open') {
                openEssenciaItem(item);
            } else if (action === 'collapse') {
                STATE.essenciaCollapsed = true;
                renderEssencia();
            } else if (action === 'expand') {
                STATE.essenciaCollapsed = false;
                renderEssencia();
            }
        });
    }

    function openEssenciaItem(item) {
        if (!item || typeof openModal !== 'function') return;
        // openModal aceita (-1, item) pra abrir item fora da lista filtrada
        const idx = (STATE.list || []).findIndex(i => i.id === item.id);
        if (idx >= 0) {
            openModal(idx);
        } else {
            openModal(-1, item);
        }
    }

    window.renderEssencia = function renderEssencia() {
        const item = resolveItem();
        if (!item) {
            removeCard();
            return;
        }
        const card = ensureCardElement();
        const collapsed = !!STATE.essenciaCollapsed;
        card.classList.toggle('collapsed', collapsed);
        const excerpt = (STATE.essencia && STATE.essencia.excerpt_pt) || '';
        // Substituir HTML inteiro evita acumular handlers
        const fresh = card.cloneNode(false);
        fresh.classList.toggle('collapsed', collapsed);
        fresh.innerHTML = buildHtml(item, excerpt, collapsed);
        card.parentNode.replaceChild(fresh, card);
        attachHandlers(fresh, item);
    };
})();
```

- [ ] **Step 3: Verificar carregamento sem erro JS**

Adicionar `<script src="js/essencia.js?v=1"></script>` em `index.html` (na próxima task vai ter cache-bust de versão; aqui só pra validar que carrega). Recarregar preview server, abrir console:

Run no preview eval:
```javascript
typeof window.renderEssencia
```
Esperado: `"function"`. (Se ainda não adicionou o `<script>`, retorna `"undefined"` — adicione e recarregue.)

- [ ] **Step 4: Smoke test manual com mock**

No preview eval:
```javascript
(() => {
  STATE.essencia = { article_id: 'johreivol01_01', excerpt_pt: 'Trecho de teste para verificar o render.' };
  STATE.essenciaCollapsed = false;
  renderEssencia();
  const card = document.getElementById('essenciaCard');
  return card ? card.querySelector('.essencia-title').textContent : 'no card';
})()
```

Esperado: retorno com título do artigo `johreivol01_01` (ex: `"O que é a Doença"`).

Toggle collapsed:
```javascript
(() => {
  STATE.essenciaCollapsed = true;
  renderEssencia();
  const card = document.getElementById('essenciaCard');
  return { collapsed: card.classList.contains('collapsed'), title: card.querySelector('.essencia-collapsed-row .title').textContent };
})()
```
Esperado: `collapsed: true`, title preenchido.

Cleanup:
```javascript
STATE.essencia = null; renderEssencia(); document.getElementById('essenciaCard');
```
Esperado: `null` (card removido).

- [ ] **Step 5: Commit**

```bash
cd C:/Mioshie_Sites/guia_johrei
git add js/essencia.js js/state.js
git commit -m "feat(essencia): add renderEssencia() and state fields

State: STATE.essencia (Supabase row), STATE.essenciaCollapsed (in-memory).
Render inserts #essenciaCard above the host element, handles collapse/expand
and Ler completo (opens existing modal). Hidden when no item resolves."
```

---

## Task 5: Wire fetch + render em `core.js`, adicionar `<script>` em `index.html`

**Files:**
- Modify: `guia_johrei/js/core.js`
- Modify: `guia_johrei/index.html`

- [ ] **Step 1: Adicionar fetch da Essência em `core.js`**

Localizar em `js/core.js#loadData` o bloco que carrega `related_v2.json` (recém-adicionado, perto da linha 100). Adicionar imediatamente abaixo dele:

```javascript
// Carrega destaque "Essência" (singleton) do Supabase. Falha silenciosa.
try {
    const SB_URL = 'https://succhmnbajvbpmoqrktq.supabase.co/rest/v1/johrei_essencia';
    const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1Y2NobW5iYWp2YnBtb3Fya3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NjY3MDgsImV4cCI6MjA5MjA0MjcwOH0.humCcLYpnnnapkLtLOeb9ZVo5EZWoWw6ItNo0WVY3DY';
    const essRes = await fetch(`${SB_URL}?select=article_id,excerpt_pt,updated_at&id=eq.1&limit=1`, {
        headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
        cache: 'no-cache'
    });
    if (essRes.ok) {
        const rows = await essRes.json();
        if (rows.length === 1) {
            STATE.essencia = rows[0];
            console.log('Essência loaded:', STATE.essencia.article_id);
        }
    }
} catch (e) { console.warn('Essência indisponível:', e); }
```

- [ ] **Step 2: Chamar `renderEssencia()` após dados carregados**

Em `js/core.js#loadData`, localizar a sequência que chama `renderTabs()`, `renderAlphabet()`, `applyFilters()`. Logo após `applyFilters()`, adicionar:

```javascript
if (typeof renderEssencia === 'function') renderEssencia();
```

- [ ] **Step 3: Adicionar `<script>` e bumps de versão em `index.html`**

Localizar o bloco de `<script>` de módulos (perto da linha 1030). Adicionar `<script src="js/essencia.js?v=1"></script>` antes de `<script src="js/core.js?v=...">`. Bumpar versões dos arquivos modificados:

- `js/state.js?v=101` → `?v=102`
- `js/core.js?v=110` → `?v=111` (depende do v atual; bumpar +1)
- `js/essencia.js?v=1` (já com `?v=1`)
- `style.css?v=...` → +1

- [ ] **Step 4: Hard reload no preview e validar logs**

```javascript
// preview_eval:
window.location.reload()
```

Aguardar load completo. Verificar console logs:
```javascript
// preview_console_logs filtrado por warn+error: deve estar vazio.
```

Esperado: nenhum erro novo. Mensagem `Essência loaded: ...` ausente porque a tabela está vazia (Task 1 só criou a tabela, não inseriu linha).

- [ ] **Step 5: Inserir uma linha de teste direto no Supabase pra ver o card**

No SQL Editor do Supabase:
```sql
insert into public.johrei_essencia (id, article_id, excerpt_pt)
values (1, 'johreivol01_01', 'Este é um trecho de teste pra validar que o card aparece corretamente no site.')
on conflict (id) do update
  set article_id = excluded.article_id,
      excerpt_pt = excluded.excerpt_pt;
```

- [ ] **Step 6: Reload preview e verificar card no site**

```javascript
// preview_eval:
window.location.reload()
```

Aguardar. Depois:
```javascript
(() => {
  const card = document.getElementById('essenciaCard');
  if (!card) return 'NO CARD';
  return {
    title: card.querySelector('.essencia-title')?.textContent,
    excerpt: card.querySelector('.essencia-excerpt')?.textContent,
    visible: card.offsetParent !== null
  };
})()
```

Esperado: `{ title: "O que é a Doença", excerpt: "Este é um trecho de teste...", visible: true }`.

- [ ] **Step 7: Testar "Ler completo" abre modal**

```javascript
(() => {
  document.querySelector('.essencia-cta').click();
  const modal = document.getElementById('itemModal') || document.querySelector('.modal-overlay');
  return modal ? 'modal opened' : 'modal NOT opened';
})()
```

Esperado: `"modal opened"`.

- [ ] **Step 8: Testar collapse/expand**

```javascript
(() => {
  // fechar modal se aberto
  if (typeof closeModal === 'function') closeModal();
  document.querySelector('.essencia-toggle').click();
  const card = document.getElementById('essenciaCard');
  return card.classList.contains('collapsed');
})()
```
Esperado: `true`. Em seguida:

```javascript
(() => {
  document.querySelector('.essencia-toggle').click();
  return document.getElementById('essenciaCard').classList.contains('collapsed');
})()
```
Esperado: `false`.

- [ ] **Step 9: Limpar a linha de teste do Supabase**

```sql
delete from public.johrei_essencia where id = 1;
```

E reload do preview pra confirmar que o card some (sem destaque).

- [ ] **Step 10: Commit**

```bash
cd C:/Mioshie_Sites/guia_johrei
git add js/core.js js/essencia.js js/state.js index.html style.css
git commit -m "feat(essencia): wire fetch and render into site

Fetches singleton johrei_essencia from Supabase REST in core.js#loadData
and calls renderEssencia() after the tabs are ready. Adds essencia.js to
index.html with cache-bust. No-op when no row exists in the table."
```

---

## Task 6: Admin UI — HTML da nova aba "Essência (Guia)"

**Files:**
- Modify: `caminho_da_felicidade/admin-supabase.html`

- [ ] **Step 1: Adicionar entrada de aba no grupo Johrei**

Localizar em `admin-supabase.html` (linha ~641) o bloco:
```html
<div class="tab-group" data-section="johrei">
    ...
    <div class="admin-tab" onclick="switchTab('analytics-johrei')">📊 Analytics</div>
</div>
```

Adicionar logo após a linha do Analytics:
```html
                <div class="admin-tab" onclick="switchTab('essencia-guia')">📌 Essência</div>
```

- [ ] **Step 2: Adicionar painel de conteúdo da aba**

Localizar o painel `<div class="tab-content" id="tab-analytics-johrei">` (linha ~1190). Logo APÓS o fechamento desse painel (encontrar o `</div>` correspondente), adicionar:

```html
<div class="tab-content" id="tab-essencia-guia">
    <div class="admin-section">
        <h2>📌 Essência — Destaque editorial do guia_johrei</h2>
        <p style="color:var(--text-muted);font-size:.85rem;max-width:680px;line-height:1.55;margin-bottom:24px;">
            Um único ensinamento aparece no card "Essência" no topo do site, em todas as abas.
            Use pra conscientizar ministrantes sobre ensinamentos centrais que ficam ocultos no fluxo natural.
            Mudanças aqui aparecem no próximo carregamento do site.
        </p>

        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:24px;max-width:760px;">
            <label style="display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.14em;color:var(--text-muted);font-weight:600;margin-bottom:8px;">
                Ensinamento em destaque
            </label>
            <div id="ess-search-wrap" style="position:relative;margin-bottom:6px;">
                <input id="ess-search" type="search" autocomplete="off" placeholder="Buscar título do ensinamento..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:.95rem;">
                <div id="ess-results" style="position:absolute;top:100%;left:0;right:0;max-height:280px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;z-index:10;display:none;"></div>
            </div>

            <div id="ess-selected" style="margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:8px;background:var(--bg);display:none;">
                <div style="font-size:.95rem;font-weight:600;color:var(--text);" id="ess-selected-title"></div>
                <div style="font-size:.78rem;color:var(--text-muted);margin-top:4px;" id="ess-selected-meta"></div>
                <div style="margin-top:10px;display:flex;gap:8px;">
                    <a id="ess-open-site" href="#" target="_blank" rel="noopener" style="font-size:.78rem;color:var(--accent);text-decoration:none;">abrir no site ↗</a>
                    <button type="button" id="ess-clear" style="font-size:.78rem;color:var(--text-muted);background:none;border:none;cursor:pointer;padding:0;">trocar</button>
                </div>
            </div>

            <label style="display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.14em;color:var(--text-muted);font-weight:600;margin:28px 0 8px;">
                Trecho exibido no card
            </label>
            <textarea id="ess-excerpt" rows="4" placeholder="Cole ou escreva o trecho de impacto que vai aparecer junto ao título no site..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:.92rem;line-height:1.5;resize:vertical;font-family:inherit;"></textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                <span style="font-size:.72rem;color:var(--text-muted);">Recomendado: até 280 caracteres</span>
                <span id="ess-charcount" style="font-size:.72rem;color:var(--text-muted);">0</span>
            </div>

            <div id="ess-status" style="margin-top:18px;font-size:.78rem;color:var(--text-muted);"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;border-top:1px solid var(--border);padding-top:18px;">
                <button type="button" id="ess-delete" style="background:none;border:1px solid var(--border);color:var(--text-muted);padding:8px 14px;border-radius:6px;cursor:pointer;font-size:.85rem;">
                    Remover destaque
                </button>
                <button type="button" id="ess-save" disabled style="background:var(--accent);color:#fff;border:none;padding:9px 22px;border-radius:6px;cursor:pointer;font-size:.9rem;font-weight:600;opacity:.5;">
                    Salvar
                </button>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 3: Adicionar a aba ao mapa `tabIndex` (linha ~1582)**

Localizar:
```javascript
const tabIndex = { 'calendar': 0, 'announcements': 1, 'access': 2, 'analytics-landing': 3, 'users': 4, 'analytics': 5, 'destaques': 6, 'reports': 7, 'findreplace': 8, 'logs': 9, 'analytics-johrei': 10 }[tab];
```

Substituir por:
```javascript
const tabIndex = { 'calendar': 0, 'announcements': 1, 'access': 2, 'analytics-landing': 3, 'users': 4, 'analytics': 5, 'destaques': 6, 'reports': 7, 'findreplace': 8, 'logs': 9, 'analytics-johrei': 10, 'essencia-guia': 11 }[tab];
```

- [ ] **Step 4: Adicionar `firstTab` mapping para Johrei**

Localizar (linha ~1565):
```javascript
const firstTab = { 'landing': 'calendar', 'caminho': 'users', 'johrei': 'analytics-johrei' }[section];
```

Manter como está — Analytics segue como primeira aba do grupo Johrei. A aba Essência fica selecionável manualmente.

- [ ] **Step 5: Hard reload do admin no browser e verificar a aba aparece**

Abrir `admin-supabase.html` no browser, fazer login. No grupo Johrei deve aparecer a aba "📌 Essência" ao lado de "📊 Analytics". Clicar nela: o painel com busca + textarea + botões deve aparecer (sem funcionalidade ainda — JS na próxima task).

- [ ] **Step 6: Commit**

```bash
cd C:/Mioshie_Sites/caminho_da_felicidade
git add admin-supabase.html
git commit -m "feat(admin): add Essência (Guia) tab UI scaffold

New tab in the Johrei group with article search field, selected-item
panel, excerpt textarea, save/delete buttons. JS wiring next."
```

---

## Task 7: Admin UI — JavaScript de busca, seleção e save

**Files:**
- Modify: `caminho_da_felicidade/admin-supabase.html` (script section)

- [ ] **Step 1: Localizar onde adicionar o JS**

Procurar em `admin-supabase.html` por outros init de aba (ex: `if (tab === 'destaques') initHlTab();` na linha ~1593). Logo após esse if, adicionar:

```javascript
      if (tab === 'essencia-guia') initEssenciaTab();
```

- [ ] **Step 2: Adicionar a função `initEssenciaTab` e helpers**

Procurar por uma área com outras `function initXxx` (perto da função `initHlTab` se existir, ou no fim do `<script type="module">`). Adicionar bloco:

```javascript
    // === Essência (Guia) tab ============================================
    let essIndex = null;          // [{ id, title, tab, source }, ...]
    let essCurrent = null;        // {id, title, source} selecionado
    let essOriginal = null;       // estado salvo no servidor
    let essLoadedOnce = false;
    const ESS_GUIA_BASE = 'https://guia.mioshie.com.br';  // domínio do guia_johrei em produção
    const ESS_INDEX_URL = `${ESS_GUIA_BASE}/data/admin_index.json`;

    async function initEssenciaTab() {
      if (essLoadedOnce) return;
      essLoadedOnce = true;

      const search = document.getElementById('ess-search');
      const results = document.getElementById('ess-results');
      const selectedBox = document.getElementById('ess-selected');
      const selectedTitle = document.getElementById('ess-selected-title');
      const selectedMeta = document.getElementById('ess-selected-meta');
      const openSiteLink = document.getElementById('ess-open-site');
      const clearBtn = document.getElementById('ess-clear');
      const excerpt = document.getElementById('ess-excerpt');
      const charcount = document.getElementById('ess-charcount');
      const saveBtn = document.getElementById('ess-save');
      const deleteBtn = document.getElementById('ess-delete');
      const statusEl = document.getElementById('ess-status');

      // Carrega índice de artigos do guia_johrei
      try {
        statusEl.textContent = 'Carregando catálogo de ensinamentos...';
        const res = await fetch(ESS_INDEX_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        essIndex = await res.json();
        statusEl.textContent = `Catálogo: ${essIndex.length} ensinamentos carregados.`;
      } catch (err) {
        statusEl.textContent = `Erro ao carregar catálogo: ${err.message}`;
        statusEl.style.color = '#e05252';
        return;
      }

      // Carrega estado atual do Supabase
      const { data: rows, error } = await supabase
        .from('johrei_essencia')
        .select('article_id, excerpt_pt, updated_at')
        .eq('id', 1)
        .limit(1);
      if (error) {
        statusEl.textContent = `Erro lendo destaque atual: ${error.message}`;
        statusEl.style.color = '#e05252';
        return;
      }
      if (rows && rows.length === 1) {
        essOriginal = rows[0];
        const item = essIndex.find(x => x.id === essOriginal.article_id);
        if (item) {
          essApplySelection(item);
          excerpt.value = essOriginal.excerpt_pt || '';
          essUpdateCharcount();
          essUpdateStatus();
        }
      } else {
        essOriginal = null;
      }

      function essApplySelection(item) {
        essCurrent = item;
        selectedTitle.textContent = item.title;
        selectedMeta.textContent = `${item.tab.replace(/_/g,' ')} · ${item.source}`;
        openSiteLink.href = `${ESS_GUIA_BASE}/?id=${encodeURIComponent(item.id)}`;
        selectedBox.style.display = '';
        results.style.display = 'none';
        search.value = '';
        essRefreshSaveState();
      }

      function essNormalize(s) {
        return (s || '').toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9 ]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function essRunSearch(q) {
        if (!essIndex || !q.trim()) { results.style.display = 'none'; return; }
        const nq = essNormalize(q);
        const tokens = nq.split(' ').filter(Boolean);
        const scored = [];
        for (const it of essIndex) {
          const nt = essNormalize(it.title);
          let score = 0;
          for (const tk of tokens) {
            if (nt.includes(tk)) score += 1;
            if (nt.startsWith(tk)) score += 1;
          }
          if (score > 0) scored.push({ score, item: it });
        }
        scored.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
        const top = scored.slice(0, 30);
        if (top.length === 0) {
          results.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:.85rem;">Nenhum resultado.</div>';
        } else {
          results.innerHTML = top.map(({ item }) => `
            <div data-id="${item.id}" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:.88rem;">
              <div style="font-weight:500;color:var(--text);">${escapeHtml(item.title)}</div>
              <div style="font-size:.72rem;color:var(--text-muted);margin-top:2px;">${escapeHtml(item.source)} · ${escapeHtml(item.tab)}</div>
            </div>
          `).join('');
          results.querySelectorAll('[data-id]').forEach(el => {
            el.addEventListener('click', () => {
              const id = el.getAttribute('data-id');
              const item = essIndex.find(x => x.id === id);
              if (item) essApplySelection(item);
            });
            el.addEventListener('mouseover', () => el.style.background = 'var(--surface)');
            el.addEventListener('mouseout', () => el.style.background = '');
          });
        }
        results.style.display = '';
      }

      function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
      }

      let essSearchTimer;
      search.addEventListener('input', () => {
        clearTimeout(essSearchTimer);
        essSearchTimer = setTimeout(() => essRunSearch(search.value), 120);
      });
      search.addEventListener('focus', () => { if (search.value.trim()) essRunSearch(search.value); });
      document.addEventListener('click', (ev) => {
        if (!search.contains(ev.target) && !results.contains(ev.target)) results.style.display = 'none';
      });

      clearBtn.addEventListener('click', () => {
        essCurrent = null;
        selectedBox.style.display = 'none';
        search.value = '';
        search.focus();
        essRefreshSaveState();
      });

      excerpt.addEventListener('input', () => {
        essUpdateCharcount();
        essRefreshSaveState();
      });

      function essUpdateCharcount() {
        const n = excerpt.value.length;
        charcount.textContent = n;
        charcount.style.color = n > 280 ? '#e05252' : 'var(--text-muted)';
      }

      function essUpdateStatus() {
        if (essOriginal && essOriginal.updated_at) {
          const d = new Date(essOriginal.updated_at);
          statusEl.textContent = `Última atualização: ${d.toLocaleString('pt-BR')}`;
          statusEl.style.color = 'var(--text-muted)';
        }
      }

      function essRefreshSaveState() {
        const ok = essCurrent && excerpt.value.trim().length > 0;
        saveBtn.disabled = !ok;
        saveBtn.style.opacity = ok ? '1' : '.5';
      }

      saveBtn.addEventListener('click', async () => {
        if (!essCurrent || !excerpt.value.trim()) return;
        saveBtn.disabled = true;
        statusEl.textContent = 'Salvando...';
        statusEl.style.color = 'var(--text-muted)';
        const { error } = await supabase
          .from('johrei_essencia')
          .upsert({ id: 1, article_id: essCurrent.id, excerpt_pt: excerpt.value.trim() }, { onConflict: 'id' });
        if (error) {
          statusEl.textContent = `Erro: ${error.message}`;
          statusEl.style.color = '#e05252';
          saveBtn.disabled = false;
          return;
        }
        // Recarrega timestamp atualizado
        const { data: rows } = await supabase
          .from('johrei_essencia')
          .select('article_id, excerpt_pt, updated_at')
          .eq('id', 1)
          .limit(1);
        if (rows && rows.length === 1) essOriginal = rows[0];
        essUpdateStatus();
        statusEl.textContent = '✓ Salvo. ' + statusEl.textContent;
        statusEl.style.color = '#10b981';
        saveBtn.disabled = false;
      });

      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Remover o destaque atual? O card "Essência" some do site na próxima reload.')) return;
        deleteBtn.disabled = true;
        const { error } = await supabase
          .from('johrei_essencia')
          .delete()
          .eq('id', 1);
        if (error) {
          alert('Erro removendo: ' + error.message);
          deleteBtn.disabled = false;
          return;
        }
        essOriginal = null;
        essCurrent = null;
        excerpt.value = '';
        selectedBox.style.display = 'none';
        statusEl.textContent = '✓ Destaque removido.';
        statusEl.style.color = '#10b981';
        essUpdateCharcount();
        essRefreshSaveState();
        deleteBtn.disabled = false;
      });
    }
```

- [ ] **Step 3: Atualizar `ESS_GUIA_BASE` com URL real do guia**

Se o domínio de produção do `guia_johrei` for diferente de `https://guia.mioshie.com.br`, ajustar a constante. Pra desenvolvimento local, pode setar pra `http://localhost:8080` ou similar conforme o preview.

- [ ] **Step 4: Garantir que o `guia_johrei` serve `admin_index.json` com CORS apropriado**

Em produção (Netlify/Vercel/Pages) arquivos estáticos JSON normalmente já vêm com `Access-Control-Allow-Origin: *`. Verificar via:

```bash
curl -I https://guia.mioshie.com.br/data/admin_index.json
```

Esperado: header `Access-Control-Allow-Origin: *` ou pelo menos o domínio do admin permitido. Se ausente, configurar no host (Netlify: `_headers` file; Vercel: `vercel.json`).

- [ ] **Step 5: Smoke test no admin**

1. Abrir `admin-supabase.html` no browser, fazer login como admin.
2. Clicar na aba "📌 Essência".
3. Aguardar mensagem "Catálogo: NNNN ensinamentos carregados.".
4. Digitar "metralhadora" na busca → resultados aparecem com o(s) artigo(s) correspondentes.
5. Clicar num resultado → painel de selecionado aparece com título + fonte.
6. Clicar "abrir no site ↗" → abre nova aba com `?id=...` mostrando o artigo no `guia_johrei`.
7. Escrever um trecho na textarea (ex: "Trecho de teste pra validação do admin.").
8. Botão "Salvar" habilita → clicar.
9. Mensagem "✓ Salvo." aparece + timestamp atualizado.
10. Recarregar `guia_johrei` em outra aba → card "Essência" aparece com título correto e trecho.

- [ ] **Step 6: Smoke test do botão "Remover destaque"**

1. No admin, clicar "Remover destaque" → confirmar.
2. Mensagem "✓ Destaque removido." aparece.
3. Recarregar `guia_johrei` → card desaparece.

- [ ] **Step 7: Commit**

```bash
cd C:/Mioshie_Sites/caminho_da_felicidade
git add admin-supabase.html
git commit -m "feat(admin): wire JS for Essência (Guia) tab

Loads admin_index.json from guia_johrei, full-text search of titles,
selection panel with deep link to live site, save/delete to
johrei_essencia singleton via Supabase JS client."
```

---

## Task 8: End-to-end smoke test + documentação no `HANDOFF.md`

**Files:**
- Modify: `guia_johrei/HANDOFF.md`

- [ ] **Step 1: Fluxo completo manual**

1. Admin: definir um destaque real ("O Johrei estilo metralhadora é inútil" se existir, ou outro).
2. Site `guia_johrei`: hard reload → card aparece no topo, em todas as abas.
3. Encolher card → fica encolhido, navegar entre abas (Fundamentos → Por Condição) → permanece encolhido.
4. Hard reload → reabre.
5. Click em "Ler completo" → modal abre com artigo certo.
6. Mobile (preview_resize 375x667) → card responsivo, padding ajustado, ainda funcional.
7. Admin: trocar destaque pra outro artigo → reload do site → novo destaque aparece.
8. Admin: remover destaque → reload → card desaparece, site continua funcional sem ele.

- [ ] **Step 2: Atualizar `HANDOFF.md` com seção da feature**

Adicionar no fim de `HANDOFF.md` (ou em seção apropriada):

```markdown
## Essência — destaque editorial (admin)

**Feature ativa em produção (2026-04-27).**

Card no topo de todas as abas do site mostra um ensinamento curado pelo
admin. Editado em `admin-supabase.html` (caminho_da_felicidade) na aba
"📌 Essência". Persistido em `johrei_essencia` (singleton, id=1) no Supabase.

**Como trocar o destaque:**
1. Login no admin → grupo Johrei → "📌 Essência".
2. Buscar e selecionar o ensinamento.
3. Escrever trecho de impacto (até ~280 chars).
4. Salvar. Próxima reload do site mostra o novo destaque.

**Pra remover:** botão "Remover destaque" + confirmar. Card some do site.

**Quando adicionar conteúdo novo ao site**, regenerar o índice consumido
pelo admin: `python scripts/migration/build_admin_index.py` e commitar
`data/admin_index.json`.

**Spec:** `docs/superpowers/specs/2026-04-27-essencia-destaque-design.md`
```

- [ ] **Step 3: Commit final**

```bash
cd C:/Mioshie_Sites/guia_johrei
git add HANDOFF.md
git commit -m "docs: document Essência feature in HANDOFF

Editorial workflow + maintenance steps for the Essência featured-teaching
card now live in production."
```

---

## Notas finais

- **Anon key visível no JS do site:** intencional, pública por design do Supabase. RLS protege escritas.
- **Dependência cross-origin:** o admin lê `admin_index.json` do domínio do `guia_johrei`. Se o domínio mudar, atualizar `ESS_GUIA_BASE` em `admin-supabase.html`.
- **Atualização do índice:** após adicionar/renomear ensinamentos no `guia_johrei`, rodar `build_admin_index.py` e commitar a saída — senão o título novo não aparece na busca do admin.
- **Limite de trecho:** soft (280 chars). Acima disso o contador fica vermelho mas o save funciona.
- **Sem rebalanceio de IDs**: tabela é singleton, não tem position/order — só uma linha sempre.
