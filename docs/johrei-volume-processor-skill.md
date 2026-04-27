---
name: johrei-volume-processor
description: >
  Processes a volume of Johrei Hô Kohza for the guia_johrei project — auditing
  the existing JSON, identifying duplicates and missing articles against the JP
  source, retranslating gaps in the calibrated PT-BR doctrinal register, and
  running the schema-v2 ingestion + JP merge + index regeneration pipeline.
  Use this skill whenever the user mentions: "processar vol N", "retraduzir vol
  N", "atacar o volume N", "limpar imported do vol N", "vol 4/5/6/7/8/9/10",
  "各論", or any work on filling/fixing entries in
  `data/johrei_volNN_bilingual.json`. Also use when the user references the
  imported_* pattern, schema v2, the calibrated translation prompt, or the
  vol 3 pipeline as a model.
---

# Johrei Volume Processor

You are working in the **guia_johrei** project (Johrei: Guia para Ministrantes — site SPA estático para ministrantes de Johrei). The goal of this skill is to take a volume from `Markdown/MD_Original/浄霊法講座N.md` (Japanese source) and produce a clean, bilingual, schema-v2-structured `data/johrei_volNN_bilingual.json` whose Portuguese reads with the doctrinal dignity of Meishu-Sama's voice, calibrated for first-time ministrantes.

The vol 3 cycle (commits `6776404`, `340cd01`, `009d9c6`) established the pipeline. This skill encodes those lessons.

## Core Principle: the Persona

Every decision answers the question: **"would a first-time ministrante, with no prior contact with these teachings, find this card RICH (preserves doctrine, citations, depth) AND EASY (clear context, navigable, free of jargon noise)?"**

If a choice degrades richness or ease, it's wrong. Period.

## Doctrinal Frame (NON-NEGOTIABLE)

> Aquilo que o mundo chama de "doença", sob a ótica de Meishu-Sama é **purificação se manifestando**. The translation must NEVER read as a medical manual.

Apply by:

- When MS speaks from his own perspective about the underlying spiritual reality → use **purificação**, **manifestação**, **afecção**, **caso**.
- When MS reports the world's view (e.g., journalist quoted speech, technical critique of medicine) → "doença" can stay as the world's framing.
- Specific named conditions (disenteria, nevralgia, dor de dente) keep their PT name BUT drop the kanji parenthetical (Ekiri-style).
- Doctrinal terms (Kyūsho, Kaso, Yakudoku, Johrei, Ohikari) preserve kanji on first mention `(Romaji [漢字])` for the ministrante's learning.

## Calibration Rules (Translation Register)

### 1. PT-BR strict, never PT-EU
- ✅ "estão fazendo", "está formando", "vai se intensificando" (gerundive aspect)
- ❌ "estão a fazer", "está a formar", "vai-se intensificando"
- Preserve enclitic only in formal literary register; otherwise reorder to BR-natural.

### 2. Sofisticação ≠ arcaísmo
Ceiling = the gold-standard primary `johreivol03_05` ("A quebra da superstição medicinal..."). If a word is more elevated than that primary uses, it's likely overshooting.
- ❌ Forbidden: *mister*, *cabal*, *outrora*, *cumpre-me*, *posto que*, *forçoso é*
- ✅ Use: *imprescindível*, *de forma definitiva*, *anteriormente*, *é necessário*, *embora*

### 3. Idiomático sobre literal
Equivalência de espírito > equivalência de superfície. Glossas embutidas, não parentéticas.
- ✅ "Seja quem for —" (for `そういう人にしろ`)
- ✅ "por assim dizer" (for `まあ`)
- ✅ "um 'Doutor' nesta obra" (not "(no Johrei)")
- ❌ "Mesmo entre essas pessoas há vários tipos —"

### 4. Quando a primária tem boa frase, copio verbatim
Não paráfrasear por paráfrasear. Variar redação só faz sentido se houver ganho concreto (correção, encurtamento, BR-naturalidade).

### 5. Q&A coloquial preserva-se coloquial
Curto JP → curto PT. Não inflar `そう` em "Esse aspecto se manifesta muito" se a primária diria "Sim, há muito disso". **MAS**: dignidade do falante manda. Meishu-Sama em sermão fala com gravidade serena — não cair no informalismo de bar.

> **Norte**: se um pastor evangélico instruído de SP, ou um padre erudito do RS, falaria essa frase do púlpito sem soar afetado, está calibrado.

### 6. Bijeção de parágrafos — opcional, NÃO estrita
Permitir quebrar 1 parágrafo JP em N parágrafos PT em pontos lógicos. Diagramação livre é o padrão das primárias. NÃO insistir em alinhamento 1:1.

### 7. Termos compostos com 浄霊
**浄霊医術** = "**arte do Johrei**" (NÃO "arte médica do Johrei"). Mantém "arte" (que carrega 術 = técnica/ofício) mas drop "médica" — Johrei não é medicina. Quando "arte" for redundante no português, pode reduzir a "Johrei". Idem para **浄霊治療**, **浄霊療法**.

**医術** isolado é "arte médica" ou "medicina" apenas quando Meishu-Sama critica a medicina convencional como instituição (e.g., "現代医学" / medicina moderna). Nunca acoplar 医 a Johrei.

## Schema v2

Each entry MUST carry:

| Field | Type | Notes |
|---|---|---|
| `id` | string | `johreivolNN_MM` sequential |
| `volume` | string | `"Johrei Hô Kohza"` |
| `volume_num` | int | 1..10 (or special for 各論) |
| `chapter_num` | string \| null | `"I"`/`"II"` only when volume has chapters (vol 4 has 2; vol 3 has none → null) |
| `chapter_title` | string \| null | matching JP chapter title in PT |
| `section_num` | string \| null | `"I"`–`"VII"` (roman) |
| `section_title` | string | |
| `article_num` | int \| null | `null` for section intro |
| `article_title` | string | full canonical title |
| `sub_letter` | string \| null | `"a"`/`"b"`/... when subitem |
| `position` | int | absolute reading order in volume |
| `parent_id` | string \| null | for subitens |
| `source_ref` | object | `{name, issue, page}` |
| `title_pt` / `title_jp` | string | |
| `content_pt` / `content_jp` | string | |
| `info_pt` / `source` | string | display strings (legacy compat) |
| `tags`, `categories`, `related_items` | arrays | populated by post-processing |

Sort key: `(volume_num, chapter_int, section_int, article_num or 0, sub_letter or '')`.

## Canonical Source Romanization

Always normalize source names to:

| JP | Romaji canônico |
|---|---|
| 御教え集 | **Mioshie-shū** |
| 御垂示録 | **Gosui-ji Roku** |
| 地上天国 | **Chijō Tengoku** |
| 御教え | **Mioshie** (when no issue/page) |
| 信仰雑話 | **Shinkō Zatsuwa** |
| 栄光 | **Eikō** |

The merge script's `SOURCE_NAME_NORMALIZE` map handles legacy variants (`Goshū`, `Mioshie-shu`, `Gosuishiroku`, `Chijo Tengoku`).

## Pipeline (8 Steps)

### Step 1 — Audit current state

```bash
python -c "
import json
with open('data/johrei_volNN_bilingual.json', encoding='utf-8') as f:
    data = json.load(f)
n_imp = sum(1 for e in data if '_imported_' in e['id'])
n_pri = len(data) - n_imp
n_empty = sum(1 for e in data if not (e.get('content_pt','') or '').strip())
print(f'Total: {len(data)} | Primaries: {n_pri} | Imported: {n_imp} | Empty PT: {n_empty}')
"
```

Print the imported list with `cp_len` to identify section headers (cp=0) vs content entries.

### Step 2 — Parse JP MD structure

Each volume has its own quirks. Inspect with:

```bash
grep -nE '^# |^\*\*[一二三四五六七八九十0-9０-９]' Markdown/MD_Original/浄霊法講座N.md
```

Map the structure: chapters (`#` level), sections (`##` or `# **kanji-roman、`), articles (`###` or `**fw-digit、`), subitems (`####`). **Vol 4 surprise**: uses `# **chapter-roman、{title}**` for sections AND has 2 chapters. Vol 3 uses `## roman、` for sections, only 1 chapter implicit. Adjust parser per volume.

### Step 3 — Identify duplicates and gaps

For each `imported_*` entry, find its PT/JP equivalent in the JP MD by hierarchical position. Three buckets:
- **Duplicate**: same article exists as primary → drop imported
- **Unique**: only in imported → KEEP & retranslate
- **Section header** (cp=0): JP equivalent is a section title → keep as section_intro entry (article_num=null) OR drop if redundant with `section_title` field

Also: scan JP MD for articles missing from BOTH primary and imported (vol 3's II.14 cadeiras was missing entirely).

### Step 4 — Write the v2 PATCH MD

File: `Markdown/MD_PT_v2/Johrei_Ho_Kohza_N_v2_PATCH.md`

Format:
```markdown
## Palestras sobre o Método de Johrei (N) — PATCH

### {Section roman}. {Section title in PT}

#### {N}. {Article title in PT}

*{Romaji n.º X, pág. Y}*

{Translated content in PT, calibrated, multi-paragraph.}
```

For volumes WITH chapters (vol 4): use a **chapter wrapper** pattern. The ingest script needs extension to handle `chapter_num`. Adapt as needed; current `ingest_v2_pt.py` may need update before vol 4.

### Step 5 — Ingest the patch

```bash
python scripts/ingest_v2_pt.py Markdown/MD_PT_v2/Johrei_Ho_Kohza_N_v2_PATCH.md --volume-num N --output /tmp/volNN_patch.json --dry-run
```

Verify entry count and structure before committing.

### Step 6 — Merge with primaries

Adapt `scripts/merge_vol03_v2.py` to `merge_volNN_v2.py`. The script:
1. Loads existing `data/johrei_volNN_bilingual.json`
2. Filters primaries (drops `_imported_*`)
3. Adds schema v2 fields per a hand-coded `PRIMARY_MAP` (legacy_id → (chapter, section, article, sub_letter))
4. Merges with patch entries
5. Sorts hierarchically, renumbers IDs, rewires `parent_id` and `related_items`
6. Backs up to `.bak.before_merge.<timestamp>`

### Step 7 — JP merger

Adapt `scripts/merge_jp_volNN.py`. Parses the JP MD with kanji-numeral conversion (sequential 二八=28 vs positional 二十七=27, special 十=10) and aligns to the merged JSON by hierarchical key, filling `title_jp` and `content_jp`.

### Step 8 — Regenerate indices and validate

```bash
cd scripts/migration
python build_admin_index.py
python build_related.py
python build_guide_precise.py
```

Then bump cache versions in `index.html` if any JS/CSS touched, reload preview, spot-check a few cards (parent with subs, stand-alone article, section intro).

## Common Pitfalls (Lessons from Vol 3)

1. **PT-EU drift**: I'm prone to writing "estão a fazer" when calibrating fast. Prompt has explicit rule but verify with grep on every patch:
   ```bash
   grep -nE 'est(á|ão|ava|avam|amos)\s+a\s+\w+(ar|er|ir)' Markdown/MD_PT_v2/Johrei_Ho_Kohza_N_v2_PATCH.md
   ```
   Should return zero hits.

2. **Archaisms slip in**: similar grep for `mister`, `cabal`, `outrora`, `forçoso`, `cumpre-me`, `se há de`.

3. **Kanji parenthetical for trivial diseases**: scan for `(Romaji [漢字])` after a non-doctrinal noun. Doctrinal terms (Kyūsho, Kaso, Yakudoku, Sonen, Ohikari, Johrei, Kannon, Shakuson) keep kanji; everything else drops it.

4. **Source on heading line + inline content** (vol 3 IV.1): JP MD sometimes has `### １、{title}（{source}）  {content...}` all on one line (markdown soft-break). Parser needs an `inline` capture group.

5. **Bold-formatted articles** (vol 3 II.10–19, vol 4 majority): use `**{digit}、{title}**（{source}）` instead of `### {digit}、`. Parser needs both regex.

6. **Renumbering breaks Supabase essência**: the welcome modal points to a hardcoded `article_id` in the Supabase `johrei_essencia` table. After merge, `johreivol03_01` no longer means what it did. **Tell the user** to update the Supabase row manually (anon key is read-only). Don't try to PATCH from code — RLS blocks silently.

7. **Renderer agrupador is essential, not optional**: without filtering subitens out of the list view in `js/filters.js#applyFilters` and composing the parent's modal in `js/modal.js#openModal`, the schema v2 hierarchy becomes a UX regression (5 fragmented "Sobre relaxar a força (X)" cards). Already implemented in vol 3 cycle (commit `009d9c6`); should work for all volumes.

8. **Paragraph spacing**: `.rich-text p { margin-bottom: 0 }` is the calibrated value (commit `009d9c6`). The `<br>` between paragraphs handles vertical rhythm.

## Calibration Tone Reference (Gold Standard)

Whenever in doubt about register, compare against this passage from `johreivol03_05` final paragraph:

> Quando tal era chegar, haverá uma necessidade premente de pessoas que curem e expliquem as razões disso; Deus está formando essas pessoas agora. Portanto, aqueles que são fiéis hoje, são essas pessoas. Seja quem for — na medicina existem doutores, bacharéis e médicos práticos —, o importante é empenhar-se ao máximo para tornar-se, por assim dizer, um "Doutor" nesta obra.

If your translation feels MORE elevated than this, you're overshooting. If LESS dignified, you're undershooting.

## When Calibration Drifts: Iteration Protocol

Translation calibration is fragile and cumulative. If user pushes back on a specific phrase, do NOT silently switch — surface what changed and apply consistently:

1. Note the rule: "X (overshooting/undershooting) → Y (calibrated)"
2. Apply the fix to the specific instance
3. **Run a sweep** for similar instances elsewhere in the patch
4. Update this skill (or the prompt) if the rule is generalizable

User's vol 3 calibrations:
- "é mister" → "é imprescindível"
- "creio que não ocorrerá sem percalços" → "...sem incidentes"
- "estão a fazer alarde" → "estão fazendo alarde" (PT-BR)
- "Não que… eles não consigam ir disfarçando" → "Embora se possa ir disfarçando a situação"
- "(Ekiri [疫痢])" → "" (drop)
- "Sim, esse aspecto se manifesta muito" → debated; user reverted to elevated form (dignidade do falante)
- "doente"/"doença" in MS's voice → "purificação" / "afecção" / "caso"

## References

- `Prompt_Traduca_v2.md` (project root) — full translation prompt with §2 glossary, §3 sources, §4 output format, §5 few-shot, §6 checklist
- `schema_v2_design.md` (project root) — schema rationale and field definitions
- `scripts/ingest_v2_pt.py` — v2 PT MD parser → JSON entries
- `scripts/merge_vol03_v2.py` — template for per-volume merge
- `scripts/merge_jp_vol03.py` — template for JP merger
- `data/johrei_vol03_bilingual.json` — completed reference volume
- Commit history: `6776404`, `340cd01`, `009d9c6` for the vol 3 cycle

## Working Order

When the user asks to process a new volume, default to this order:

1. **Audit** (Step 1-3) — present findings, confirm scope before retranslating
2. **Schema extension** if needed (e.g., chapter_num for vol 4) — propose, confirm, implement
3. **Patch translation** (Step 4) — write the PATCH MD
4. **Iterative calibration** — translate 1-2 articles first, get feedback, iterate, then complete
5. **Pipeline execution** (Steps 5-8)
6. **Validation in browser** — open a few cards, verify rendering
7. **Commit** — separate commits for: schema/script changes, translation patch, pipeline output (vol JSON + indices), CSS/JS tweaks if any

If the user pushes pace ("vamos aos poucos", "sem pressa"), stay in step 1-3 and confirm scope before any retranslation. If they push to translate immediately, deliver a small calibration sample (one article) first.
