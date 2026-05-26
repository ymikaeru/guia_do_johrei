# Handoff — Sistema Bilíngue + Retradução Gemini

> **Para retomar em nova janela do Claude Code.** Este documento tem TODO o contexto da sessão anterior.

---

## 🎯 Objetivo geral

Construir um sistema de revisão/retradução bilíngue PT↔JP para o Guia do Johrei, alinhado ao admin do CdF (caminho_da_felicidade). O admin do CdF já tem editor parágrafo-a-parágrafo JP|PT lado a lado quando há bijeção 1:1, sugestão de IA por parágrafo, e função "Retraduzir tudo" — está em [`C:\Mioshie_Sites\caminho_da_felicidade\js\admin\tabs\translation-review-guia.js`](C:\Mioshie_Sites\caminho_da_felicidade\js\admin\tabs\translation-review-guia.js).

A meta é **bijeção paragráfica 100%** nas 6 tabs do guia_johrei para que o modo `_ge_renderParagraphs` do admin sempre funcione.

---

## ✅ O que foi feito nesta sessão

### 1. Novo arquivo bilíngue criado

Antes desta sessão existiam 8 arquivos `.md` bilíngues. Faltava a 5ª aba do site (**Detalhado / Estudo Ponto Focal**).

Criado [`Markdown/MD_PT_JP_v4/Aba Estudo Detalhado bilingue.md`](Markdown/MD_PT_JP_v4/Aba Estudo Detalhado bilingue.md) (3431 linhas, 347 KB):
- **Sub-aba I** = Pontos Focais 01 ↔ 各論 (12 capítulos: 7 sistemas + 5 referências)
- **Sub-aba II** = Pontos Focais 02 ↔ 各論２ (Partes I-VIII + X + XI; numeração mantida fiel ao source que pula IX)
- **Sub-aba III** = 宗教篇 (seção religiosa/espiritual)

Fontes:
- PT: `Markdown/BKP/MD_Portugues/Pontos Focais 01_Prompt v5.md` + `Pontos Focais 02_Prompt v5.md`
- JP: `Markdown/BKP/MD_Original/各論.md` + `各論２.md`

### 2. Injeção JP nos `tab_*.json`

#### Estado antes
3 de 6 tabs sem `conteudo_jp`:
- ❌ `tab_pratica.json` (33 artigos)
- ❌ `tab_critica_farmacologica.json` (47 artigos com granularidade agregada — `### N. Sub-título` dentro de `conteudo`)
- ❌ `tab_por_regiao.json` (257 artigos, dispersos em 5 MDs)

#### Mudanças no script
Estendido [`scripts/merge_bilingual_md.mjs`](scripts/merge_bilingual_md.mjs):

1. **TAB_CONFIG aceita lista de MDs** (`por_regiao` consome 5 arquivos: Cabeca, Doencas Femininas, Estomago-Abdomen, Olhos-Ouvidos-Nariz-Garganta-Dentes, Tuberculose-Asma-Cardiacas)
2. **`normalizeTitle()` melhorado**:
   - Remove sufixo `(Ensinamento N)` que aparece nos títulos do JSON
   - Remove pontuação não-estrutural (vírgulas, pontos, parênteses) pra tolerar variações como "etc., e" vs "etc. e"
3. **Suporte a numerais romanos** no parser: `### I.1.`, `### II.3.`, etc. (orientações em critica_farmacologica)
4. **Nova flag `--regerar`**: sobrescreve TANTO `conteudo` quanto `conteudo_jp` a partir do MD bilíngue, garantindo bijeção paragráfica 100% por construção. Faz backup `tab_X.json.bak` automaticamente.
5. **Lógica de agregação**: para artigos JSON que têm `### N. Sub-título` dentro de `conteudo`, o script parseia os sub-títulos, casa cada um com artigo MD, e reconstrói `conteudo`/`conteudo_jp` espelhados.

#### Decisão arquitetural: `--regerar` vs preservar v5_calibrated

O usuário confirmou: **"só temos conteúdo calibrado para Fundamentos"** — para as outras 3 tabs (pratica, critica_farmacologica, por_regiao), não há tradução calibrada que valha preservar.

E ainda: **"ainda pretendemos retraduzir se for necessário, por isso o mais importante é a sincronização perfeita"**.

Decisão: rodar `--regerar` em todas as 4 tabs (incluindo fundamentos, pois o admin tem `retraduzirTudoGuiaAI` para corrigir qualquer artigo individualmente).

#### Comandos executados
```bash
node scripts/merge_bilingual_md.mjs --tab=fundamentos --regerar --confirm
node scripts/merge_bilingual_md.mjs --tab=pratica --regerar --confirm
node scripts/merge_bilingual_md.mjs --tab=critica_farmacologica --regerar --confirm
node scripts/merge_bilingual_md.mjs --tab=por_regiao --regerar --confirm
```

#### Resultado: bijeção paragráfica atual

| Tab | Antes | Depois | Mismatches |
|---|---|---|---|
| fundamentos | 83% (10/12) | **92% (11/12)** | 1 |
| pratica | 84% (26/31) | **87% (27/31)** | 4 |
| critica_farmacologica | 19% (6/31) | **94% (44/47)** | 3 |
| por_regiao | 91% (232/254) | **94% (238/254)** | 16 |
| estudo_aprofundado | 88% (605/688) | 88% | 83 |
| estudo_detalhado | 75% (132/176) | 75% | 44 |
| **TOTAL** | — | — | **151** |

`estudo_*` não foram regerados (não têm MD bilíngue equivalente — são populados de `JK1-JK26` JSONs).

### 3. Análise dos 151 mismatches restantes

Classificação por padrão (rodado em script de análise descartado):
- **39 (26%)**: PT tem "Pergunta do fiel" / "Resposta de Meishu-Sama" como parágrafo isolado, JP mantém junto
- **33 (22%)**: PT tem "Ensinamento/Orientação de Meishu-Sama: ..." como heading separado
- **3 (2%)**: source line `*(Mioshie-shū)*` isolada em PT
- **76 (50%)**: outros (PT monobloco vs JP multi-parágrafo, `### N、` headers japoneses sem equivalente em PT, etc.)

Decisão: em vez de fix algorítmico parcial, **retradução completa via LLM** com bijeção forçada — abordagem mais limpa e consistente, especialmente porque o usuário já planeja retraduzir tudo eventualmente.

### 4. Script de retradução via Gemini

Adaptado de [`C:\Mioshie_Sites\mioshie_college_offline\scripts\retranslate_suspicious.py`](C:\Mioshie_Sites\mioshie_college_offline\scripts\retranslate_suspicious.py) — mesma estrutura scan→save→translate→apply.

#### Arquivos criados

1. **[`scripts/PROMPT_RETRADUCAO_GUIA.md`](scripts/PROMPT_RETRADUCAO_GUIA.md)** — combina:
   - Persona Sekaikyuseikyou + anti-alucinação do CdF (`PROMPT_TRANSLACAO_VOL2.md`)
   - **Regra de bijeção 1:1 crítica** (`¶1`, `¶2`, ..., `¶N`) — adaptada do `retraduzirTudoGuiaAI` do admin
   - **Glossário Johrei** (jōka, yakudoku, kyūsho, katamari, Komyo Nyorai, 力を抜く→retirar a força, etc.) — do `GUIA_AI_GUIDELINES`
   - Calibração PT-BR (evitar Ademais/Outrossim/Cumpre/Eis que / preferir Por isso/Assim/É preciso)

2. **[`scripts/gemini_retraduzir_guia.py`](scripts/gemini_retraduzir_guia.py)** — 3 modos:
   - `scan`: varre `data/tab_*.json`, identifica `ptN !== jpN`, salva em `data/_retrad_pending.json`
   - `translate`: batches de 4 artigos ao Gemini, salva em `data/_retrad_results.json`
   - `apply`: valida bijeção via `parse_numbered_response`, faz backup `*.bak.retrad`, substitui só os que passaram

   Schemas suportados:
   ```python
   TAB_SCHEMAS = {
       "tab_fundamentos.json":           ("conteudo",   "conteudo_jp"),
       "tab_pratica.json":               ("conteudo",   "conteudo_jp"),
       "tab_critica_farmacologica.json": ("conteudo",   "conteudo_jp"),
       "tab_por_regiao.json":            ("conteudo",   "conteudo_jp"),
       "tab_estudo_aprofundado.json":    ("content_pt", "content_jp"),
       "tab_estudo_detalhado.json":      ("content_pt", "content_jp"),
   }
   ```

   Config Gemini:
   ```python
   MODEL_NAME = "gemini-2.5-pro-preview-03-25"   # alternativa: "gemini-3.1-pro-preview"
   temperature = 0.3
   response_mime_type = "application/json"
   safety BLOCK_NONE em todas categorias
   BATCH_SIZE = 4
   INTER_BATCH_DELAY = 2  # segundos
   ```

3. **[`data/_retrad_pending.json`](data/_retrad_pending.json)** — 151 mismatches já identificados, pronto para o `translate`.

---

## 🚀 PRÓXIMO PASSO

A próxima ação a executar é o **teste com 3 artigos**:

```powershell
cd C:\Mioshie_Sites\guia_johrei
$env:GEMINI_API_KEY = "AIzaSyBjCfPqcYMpI6i5LAprBF6uOGx2xPP6ojw"

# 1. Teste rápido (custa centavos)
python scripts/gemini_retraduzir_guia.py translate --limit 3

# 2. Inspecione o output
cat data/_retrad_results.json | head -100

# 3. Se OK, batch completo (~3-5 min para 151 artigos)
python scripts/gemini_retraduzir_guia.py translate

# 4. Aplica nos JSONs com validação de bijeção
python scripts/gemini_retraduzir_guia.py apply
```

A API key é a mesma usada em [`retranslate_suspicious.py`](C:\Mioshie_Sites\mioshie_college_offline\scripts\retranslate_suspicious.py) do CdF (linha 26). **Esta operação foi interrompida porque o usuário ainda não tinha aprovado rodar.**

---

## 📋 Como o `apply` funciona (importante)

```python
def apply_translations(results, force=False):
    # 1. Agrupa results por tab_file
    # 2. Para cada tab: backup tab_X.json.bak.retrad (se não existe)
    # 3. Para cada artigo:
    #    a. Lê content_ptbr_numbered (formato "¶1\n[txt]\n\n¶2\n[txt]")
    #    b. parse_numbered_response valida count == jp_n
    #    c. Se OK: substitui content_pt no JSON (e title se vier)
    #    d. Se falha: SKIP (não toca no artigo)
    # 4. Salva tab_X.json com escrita atômica (json.dump)
    # 5. Resumo: applied / skipped_bijection / skipped_no_path
```

Garantias:
- ✅ Backup automático (`*.bak.retrad`) antes de qualquer escrita
- ✅ Artigos com bijeção falhada ficam intocados → reaparecem no próximo `scan`
- ✅ Idempotente: rodar `apply` várias vezes não duplica nada
- ⚠️ Flag `--force` ignora validação de bijeção (não usar)

---

## 🔑 Decisões arquiteturais para lembrar

1. **Estrutura de IDs preservada**: o `--regerar` mantém `id`/`titulo`/`fonte` do JSON original — só sobrescreve `conteudo`/`conteudo_jp`. Importante porque `translation_reports_guia` (Supabase) referencia `article_id`.

2. **`critica_farmacologica` continua agregado**: tem 47 artigos no JSON com `### N. Sub-título` dentro de `conteudo`. O script `--regerar` lida com isso construindo `conteudo`/`conteudo_jp` espelhados a partir dos sub-itens do MD bilíngue.

3. **`por_regiao` tem 3 typos** que não casam mesmo com normalização (ex.: "Cego" vs "Cega", "Frequente" vs "Frequentemente"). Fix manual no JSON é mais rápido que retradução.

4. **Admin do CdF é fonte da verdade do UX**: o `translation-review-guia.js` é o consumidor dos JSONs. Qualquer mudança de estrutura nos JSONs deve verificar que o admin ainda parseia (especialmente `_ge_findArticleInTabJson` e `_ge_renderParagraphs`).

5. **`fundamentos` perdeu o v5_calibrated** ao rodar `--regerar`. O usuário aprovou porque planeja retraduzir tudo eventualmente.

---

## 📂 Mapa de arquivos

```
C:\Mioshie_Sites\guia_johrei\
├── HANDOFF_BILINGUAL_RETRAD.md         ← ESTE DOCUMENTO
├── scripts\
│   ├── PROMPT_RETRADUCAO_GUIA.md       ← prompt Gemini (NOVO)
│   ├── gemini_retraduzir_guia.py       ← script batch retradução (NOVO)
│   └── merge_bilingual_md.mjs          ← --regerar + agregação (MODIFICADO)
├── data\
│   ├── tab_fundamentos.json            ← regerado, backup em .bak
│   ├── tab_pratica.json                ← regerado, backup em .bak
│   ├── tab_critica_farmacologica.json  ← regerado, backup em .bak
│   ├── tab_por_regiao.json             ← regerado, backup em .bak
│   ├── tab_estudo_aprofundado.json     ← schema content_pt/content_jp
│   ├── tab_estudo_detalhado.json       ← schema content_pt/content_jp
│   ├── _retrad_pending.json            ← 151 mismatches identificados
│   └── _retrad_results.json            ← (será criado pelo translate)
└── Markdown\MD_PT_JP_v4\
    └── Aba Estudo Detalhado bilingue.md  ← NOVO (3431 linhas)

C:\Mioshie_Sites\caminho_da_felicidade\
└── js\admin\tabs\
    └── translation-review-guia.js      ← consumidor dos JSONs (READ-ONLY)

C:\Mioshie_Sites\mioshie_college_offline\
├── scripts\
│   ├── retranslate_suspicious.py       ← TEMPLATE do nosso script
│   ├── gemini_translate.py             ← padrão simples Gemini
│   └── gemini_translate_async.py       ← padrão paralelo (50 concurrent)
└── Backup\prompts\
    ├── PROMPT_TRANSLACAO.md            ← prompt base CdF
    ├── PROMPT_TRANSLACAO_VOL2.md       ← prompt VOL2 CdF
    └── PROMPT_TRANSLACAO_VOL4.md       ← prompt VOL4 CdF
```

---

## ⚠️ Pontos de atenção

1. **Warning `google.generativeai` deprecated** — só warning, continua funcionando. Migrar pra `google.genai` se for refatorar.

2. **Modelo Gemini**: `gemini-2.5-pro-preview-03-25` no script. Se der erro de modelo descontinuado, trocar `MODEL_NAME` no topo do script para `gemini-3.1-pro-preview` ou similar. Verificar quais modelos estão disponíveis na conta.

3. **Após `apply`, fazer upload pro Supabase Storage** (bucket `guia-data`) — só assim o admin do CdF passa a ver as mudanças. O script atual NÃO faz isso automaticamente.

4. **`estudo_aprofundado` e `estudo_detalhado`** têm 127 mismatches (83+44) — esses só podem ser corrigidos via retradução LLM, já que não têm `.md` bilíngue equivalente.

5. **Memória do projeto** (`C:\Users\ymika\.claude\projects\C--Mioshie-Sites-caminho-da-felicidade\memory\MEMORY.md`) tem regras de feedback do usuário sobre nomes japoneses em romaji, refator oportunista, etc. — boa leitura pra nova sessão.

---

## 📜 Prompt sugerido para abrir nova janela

> Estou continuando uma tarefa do projeto guia_johrei. Por favor leia `C:\Mioshie_Sites\guia_johrei\HANDOFF_BILINGUAL_RETRAD.md` antes de começar — contém todo o contexto da sessão anterior. A próxima ação é rodar o teste de tradução com `--limit 3`.
