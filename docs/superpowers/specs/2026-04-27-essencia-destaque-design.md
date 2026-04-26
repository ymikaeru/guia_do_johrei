# Essência — Destaque Editorial Curado

**Data:** 2026-04-27
**Escopo:** Adicionar um card editorial fixo no topo do site `guia_johrei` que destaca um ensinamento de Meishu-Sama escolhido pelo admin. O destaque é gerenciado pelo admin existente em `caminho_da_felicidade/admin-supabase.html` e persistido no Supabase.

## Contexto

O acervo do `guia_johrei` tem 1.342 ensinamentos. Vários textos importantes (especialmente do Estudo Aprofundado, ~688 itens) ficam ocultos no fluxo natural de navegação — o ministrante chega via busca clínica ou aba específica e raramente encontra ensinamentos doutrinários inéditos sobre a importância dos pontos focais.

O objetivo é dar ao admin um canal editorial para conscientizar ministrantes sobre ensinamentos cruciais (ex: "O Johrei estilo metralhadora é inútil", "A quebra da superstição medicinal e a urgência na formação de praticantes capazes") sem mexer na organização canônica das abas.

A solução foi escolhida após brainstorm que considerou alternativas mais ambiciosas (aba completa "Indicação de Leitura" com lista curada, edição de roteamento de abas, etc.) e convergiu para o mínimo necessário: **um destaque por vez, gerenciável pelo admin, visível no topo de todas as abas**.

## Goals

- Admin escolhe um ensinamento existente do acervo e escreve um trecho curto de impacto.
- Card "Essência" aparece fixo acima da barra de abas, em todas as abas, com título + trecho + botão "Ler completo".
- "Ler completo" abre o modal de leitura existente — sem reinventar leitor.
- Admin troca o destaque a qualquer momento via Supabase; mudança aparece no próximo page load.
- Reuso integral da auth, infra e padrões do admin existente.

## Non-goals

- Múltiplos destaques simultâneos. Apenas 1.
- Trecho automático. Admin escolhe e escreve sempre.
- Aba nova no site. O destaque é um card, não uma aba.
- Edição de tags, conteúdo ou roteamento dos artigos. Só seleção de qual destacar.
- Sistema de aprovação/draft. Admin único, mudança vira live na hora.
- Espelhar conteúdo dos artigos no Supabase. Admin só lida com índice leve de títulos.

## Arquitetura

```
┌─────────────────────────────────────┐         ┌──────────────────────────┐
│ caminho_da_felicidade               │ writes  │ Supabase                 │
│   admin-supabase.html               │────────→│   johrei_essencia        │
│   nova aba "📌 Essência (Guia)"     │ (auth)  │   (1 linha)              │
└─────────────────────────────────────┘         └──────────┬───────────────┘
                ▲                                          │ public REST
                │ reads                                    │ (anon, RLS read)
                │ (cross-origin GET)                       ▼
                │                              ┌──────────────────────────┐
                │ ┌──── data/admin_index.json  │ guia_johrei (site)       │
                │ │     (índice leve estático) │   card "Essência" topo   │
                └─┴────────────────────────────│   abre modal existente   │
                                               └──────────────────────────┘
```

Três peças móveis:

1. **Tabela Supabase** `johrei_essencia` — estado da curadoria (1 linha sempre).
2. **`data/admin_index.json`** — índice estático de títulos no `guia_johrei`, consumido só pelo admin para popular o seletor.
3. **Card no site** — lê `johrei_essencia` em runtime, renderiza no topo.

## Modelo de dados

### Tabela `johrei_essencia`

```sql
create table johrei_essencia (
  id          smallint primary key default 1 check (id = 1),  -- singleton
  article_id  text not null,
  excerpt_pt  text not null,
  updated_at  timestamptz default now(),
  updated_by  uuid references auth.users(id)
);

alter table johrei_essencia enable row level security;

-- Leitura pública para o site
create policy "anon read essencia"
  on johrei_essencia for select
  to anon using (true);

-- Escrita só para admin (mesmo padrão das outras tabelas do admin)
create policy "admin write essencia"
  on johrei_essencia for all
  to authenticated
  using (auth.jwt() ->> 'role' = 'admin')
  with check (auth.jwt() ->> 'role' = 'admin');
```

A constraint `check (id = 1)` garante singleton — não existe segunda linha. Admin faz `upsert` na linha id=1.

### Estado inicial

Tabela vazia → site não renderiza o card (sem destaque). Admin pode definir o primeiro destaque a qualquer momento.

### Endpoint de leitura (consumido pelo site)

```
GET https://<projeto>.supabase.co/rest/v1/johrei_essencia
    ?select=article_id,excerpt_pt,updated_at
    &id=eq.1
    &limit=1
```

Headers: `apikey: <anon_key>`, `Authorization: Bearer <anon_key>`. ~200 bytes de resposta.

## Componentes

### A. Card "Essência" no site

**Localização:** topo da página, acima da barra de abas (`<nav id="tabBar">`), abaixo do header.

**Aparência (aberto):**

```
┌─ ESSÊNCIA ────────────────────────────────────[—]─┐
│  O Johrei estilo metralhadora é inútil            │
│                                                    │
│  Trecho de até ~3 linhas escrito pelo admin com   │
│  a frase de impacto que sintetiza o ensinamento.  │
│                                                    │
│                              [ Ler completo → ]   │
└────────────────────────────────────────────────────┘
```

**Aparência (encolhido):**

```
┌─ ESSÊNCIA: O Johrei estilo metralhadora é inútil [+]─┐
└──────────────────────────────────────────────────────┘
```

**Comportamento:**

- Aparece sempre que `STATE.essencia` existir e `STATE.essencia.article_id` resolver para um item em `STATE.globalData`. Se não, card omitido (sem placeholder).
- Estado inicial: **aberto a cada page load** (hard reload reabre).
- Click no botão `[—]`: encolhe. Estado mantido apenas em memória (variável JS) durante a sessão SPA. Navegar entre abas dentro do site mantém o encolhido; reload no navegador descarta e volta pra aberto.
- Click no botão `[+]` (estado encolhido): reabre.
- Click em "Ler completo": chama `openModal(-1, item)` com o item resolvido (mesmo fluxo de qualquer artigo da lista, com `?id=...` no URL).
- Click no título do card (estado encolhido): equivalente a "Ler completo".

**Onde renderizar:**

Novo arquivo `js/essencia.js` exportando `renderEssencia()`, chamado em `core.js#loadData` após `STATE.globalData` populado e `STATE.essencia` carregado. Insere o `<section id="essenciaCard">` antes de `<nav id="tabBar">`.

**Estilo:** distinto do resto do layout (background levemente acentuado, borda fina com cor de destaque tipo `var(--cat-amber)`), mas sem competir com o conteúdo principal. Mobile: padding ajustado, mesma estrutura.

### B. Fetch da curadoria em `core.js#loadData`

Após `globalData` populado:

```javascript
// Carrega destaque "Essência" (singleton) do Supabase. Falha silenciosa.
try {
    const SB_URL = 'https://<projeto>.supabase.co/rest/v1/johrei_essencia';
    const SB_ANON = '<anon_key_publica>';
    const res = await fetch(`${SB_URL}?select=article_id,excerpt_pt,updated_at&id=eq.1&limit=1`, {
        headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
        cache: 'no-cache'
    });
    if (res.ok) {
        const rows = await res.json();
        if (rows.length === 1) {
            STATE.essencia = rows[0];  // { article_id, excerpt_pt, updated_at }
        }
    }
} catch (e) { console.warn('Essência indisponível:', e); }

if (typeof renderEssencia === 'function') renderEssencia();
```

`cache: 'no-cache'` garante que o destaque atual sempre apareça; custo trivial (~200 bytes).

### C. Índice leve para o admin: `data/admin_index.json`

Gerado por `scripts/migration/build_admin_index.py`, formato:

```json
[
  {"id":"johreivol01_01","title":"O que é a Doença","tab":"fundamentos","source":"Johrei Hô Kohza Vol.01"},
  {"id":"johreivol01_02","title":"A Gênese dos Bacilos","tab":"fundamentos","source":"Johrei Hô Kohza Vol.01"},
  ...
]
```

Tamanho estimado: ~150KB pra 1.342 artigos. O script aplica `tab_overrides.json` ao calcular `tab` (a aba final onde o artigo aparece, não a fonte original).

Roda manualmente quando o conteúdo do site muda — entra na pipeline de migrações já documentada em `CLAUDE.md`. O arquivo é committado no repo.

### D. Aba "Essência (Guia)" no admin

**Localização:** `admin-supabase.html` no projeto `caminho_da_felicidade`. Nova entrada de aba dentro do grupo "Johrei", ao lado do "📊 Analytics" existente.

**Layout:**

```
┌─ Essência (Guia) ─────────────────────────────────────────────┐
│                                                                │
│  Ensinamento em destaque                                       │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ [🔍 buscar título do ensinamento...]                     │ │
│  │                                                          │ │
│  │ Selecionado: O Johrei estilo metralhadora é inútil       │ │
│  │              Estudo Aprofundado · Johrei Hô Kohza Vol.04 │ │
│  │              [abrir no site ↗]   [trocar]                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  Trecho exibido no card                                        │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ <textarea de 3-4 linhas, livre>                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│  Limite recomendado: 280 caracteres                            │
│                                                                │
│  Última atualização: 2026-04-27 14:32 por <admin>              │
│                                                                │
│         [ Remover destaque ]            [ Salvar ]             │
└────────────────────────────────────────────────────────────────┘
```

**Componentes:**

1. **Busca de ensinamento** — autocomplete que filtra `admin_index.json` por título. Click seleciona; mostra fonte e aba atual.
2. **Link "abrir no site ↗"** — abre `https://<dominio_guia>/?id=<article_id>` em nova aba. Permite ler o conteúdo completo no contexto real antes de decidir.
3. **Textarea de trecho** — texto livre, sem formatação. Contador de caracteres. Limite de 280 é guideline, não hard.
4. **Botão "Salvar"** — `upsert` na linha id=1: `{id:1, article_id, excerpt_pt, updated_by:auth.uid()}`. Toast "Salvo" + atualiza "Última atualização".
5. **Botão "Remover destaque"** — `delete from johrei_essencia where id=1`. Confirmation prompt. Após, card some no site na próxima reload de visitante.
6. **Estado inicial** — se nenhum destaque, layout vazio com `[Selecionar ensinamento]`. Após selecionar, fluxo normal.

**Carregamento do índice:** ao entrar na aba pela primeira vez, fetch do `https://<dominio_guia>/data/admin_index.json`. Cacheado em memória pela sessão. CORS: o site `guia_johrei` precisa servir o arquivo com `Access-Control-Allow-Origin: *` (Netlify/Vercel/Pages fazem isso pra arquivos estáticos por padrão).

## Fluxo do dado

```
1. Admin entra na aba "Essência (Guia)"
   → fetch admin_index.json (1.342 títulos, ~150KB)
   → fetch johrei_essencia (linha atual ou null)
   → render UI

2. Admin escolhe artigo + escreve trecho + clica Salvar
   → POST/PATCH johrei_essencia (upsert id=1)
   → toast "Salvo"

3. Visitante carrega guia_johrei
   → loadData() carrega tudo como hoje
   → fetch johrei_essencia (~200 bytes)
   → renderEssencia() insere card antes da tab bar
   → visitante vê destaque

4. Visitante clica "Ler completo"
   → openModal com o item resolvido
   → URL muda para ?id=<article_id>
```

## Cache e atualização

- Site usa `cache: 'no-cache'` no fetch ao Supabase → mudanças aparecem na próxima reload do visitante (sem delay artificial).
- Admin lê o índice de títulos com cache HTTP padrão (~hora). Se admin precisa de novos artigos, hard reload da página do admin.
- `admin_index.json` é regenerado manualmente quando conteúdo do site muda. Pipeline em `CLAUDE.md` é atualizada.

## Tratamento de erros

- **Supabase fora do ar / fetch falha**: `STATE.essencia = undefined`, card não renderiza, resto do site funciona normalmente.
- **`article_id` aponta pra ID que não existe** (depois de remoção/refactor de conteúdo): card não renderiza. Admin precisa selecionar outro.
- **CORS bloqueia o índice no admin**: sintoma só aparece pro admin. Resolver no host estático do site.
- **Admin sem `role=admin` no JWT**: RLS bloqueia escrita. Erro visível na interface.

## Migration / deploy

Ordem das mudanças, do menos arriscado pro mais visível:

1. **SQL migration no Supabase** — criar tabela `johrei_essencia` + RLS. Sem efeito colateral; sem dados.
2. **Script `build_admin_index.py` no `guia_johrei`** — gera `data/admin_index.json` no repo. Nenhum consumidor ainda.
3. **Aba no admin** (`admin-supabase.html`) — UI completa, salva no Supabase. Em produção, mas sem efeito visível no site público.
4. **Smoke test do admin** — selecionar um ensinamento, escrever trecho, salvar, verificar linha no Supabase.
5. **Card no site `guia_johrei`** — `essencia.js` + fetch em `core.js` + bump de versão. Card aparece pra visitantes.
6. **Validação visual** — preview server, modal abre corretamente, encolhe/expande funciona, mobile OK.

Rollback de cada passo é trivial:
- Reverter site: cache-bust do `core.js` pra versão anterior.
- Esconder card sem rollback de código: admin remove o destaque (`Remover destaque`).
- Desabilitar admin: remover a aba do `admin-supabase.html`.

## Riscos

- **Anon key visível no JS**: por design do Supabase. RLS protege contra escritas. Não é vulnerabilidade.
- **CORS pro `admin_index.json`**: dependente do host. Se hosting muda, validar headers.
- **Sincronização do índice**: se admin escolhe um artigo recém-adicionado mas o índice ainda não foi regenerado, o título não aparece na busca. Mitigação: regenerar `admin_index.json` faz parte da pipeline de novos conteúdos.
- **Admin esquece de atualizar trecho com frequência**: mostra-se "Última atualização: há N dias" no admin pra criar consciência. Não há automação além disso.

## Métricas de sucesso

- Card aparece em todas as abas do site, distinto visualmente.
- Encolher/reabrir funciona; estado persiste por sessão.
- Click em "Ler completo" abre o modal correto.
- Admin consegue selecionar um ensinamento, escrever trecho e salvar em <30s.
- Mudança no admin reflete no site em uma reload.
