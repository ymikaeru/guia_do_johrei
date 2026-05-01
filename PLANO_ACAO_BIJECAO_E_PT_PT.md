# Plano de Ação — Bijeção PT/JP + Cleanup PT-PT

> **Data**: 2026-04-29
> **Branch**: `feat/vol01-schema-v2`
> **Last commit**: `577cc6f fix(parallel): single-row fallback when paragraph counts mismatch`
>
> Conceito-norte do usuário:
> *"O português deve respeitar a hierarquia de títulos e quebra de parágrafos do original japonês, e não usar o português de Portugal na tradução."*

---

## Estado atual (o que já está feito)

| Trabalho | Status |
|---|---|
| Vol 02 retraduzido com calibre §1.4 (BR-elevado) | ✅ |
| FocusPoints sweep: 254 falsos positivos removidos | ✅ |
| Volume reader modal (book-style, dropdown, TOC, autoscroll) | ✅ |
| PT/JP paragraph-aligned com fallback `display: contents` + single-row quando mismatch | ✅ |
| Detail modal compare reusa `renderParagraphAligned` | ✅ |
| Subitens (a)(b)(c) renderizam com hierarquia limpa (título único, fonte por subitem) | ✅ |
| Prompt §1.4.1-10 + §2.1 + §2.2 + §6 atualizados | ✅ |

## Pendentes — 3 frentes de DADOS

### Frente 1: PT-PT cleanup (mais rápido, ~30min)

**Hits mapeados** por volume (regex já validada):

| Vol | Hits | Tipos predominantes |
|---|---|---|
| **07** | **21** ⚠️ | PT-PT vocab + "está a + inf" |
| 06 | 12 | voseu (deveis, tendes, vossos) |
| 03 | 10 | voseu |
| 05 | 6 | voseu |
| 08 | 3 | voseu |
| 04 | 1 | voseu |

**Regex para detecção** (já implementada nas auditorias da sessão):
```python
PT_PT = re.compile(r'\b(controlo|controla|controlas|facto|factos|assassinio|registo|registos|contacto|contactos|objectivo|objectiva|directo|directa|directamente|óptimo|óptima|eléctric|automóvel|autocarro|camião|casa de banho|telemóvel|pequeno-almoço|relvado|sumo|infectar|redacção|acção|baptiz|optimist|à espera de|a contento|asneira|vestíbulo|agarrad)\b', re.IGNORECASE)
ESTAR_A_INF = re.compile(r'\b(está|estão|estava|estavam|estou|estamos)\s+a\s+\w+(ar|er|ir)\b')
ARCHAISM = re.compile(r'\b(mister|cabal|outrora|cumpre-me|forçoso é|se há de|acumulei?s|tendes|deveis|ministrai|vossos?|vossas?)\b', re.IGNORECASE)
```

**Substitutos canônicos** (em `Prompt_Traduca_v2.md` §1.4.1):
- `controlo` → `controle`
- `facto` → `fato`
- `está a fazer` → `está fazendo` (gerúndio BR)
- `deveis` → `devem` (ou `é preciso`)
- `tendes` → `têm`
- `vossos` → `seus`
- `à espera de` → `esperando` (gerúndio)
- `a contento` → `do jeito que queria` / `a seu gosto`
- `vestíbulo` → `entrada` / `hall`
- `agarrada à` → `grudada na`
- etc.

**Ação para próxima sessão**:
1. Rodar script `scripts/migration/cleanup_pt_pt.py` (criar) que:
   - Para cada vol JSON, varre `content_pt` + `title_pt` + `info_pt`
   - Aplica substituições da tabela canônica
   - Backup `.bak.pt_pt.<timestamp>`
   - Verifica JP intacto por hash MD5
   - Imprime hits antes/depois por vol
2. Validar amostras visualmente (vol 07 primeiro — maior volume de mudanças)
3. Para voseu (`deveis`/`tendes`/`vossos`) — pode precisar revisão manual contextual:
   - "Vós deveis..." → "Vocês devem..." OU "Deve-se..." dependendo do tom
   - Sugestão: rodar com `--interactive` mostrando contexto, deixar usuário aprovar substituição linha-a-linha em casos voseu
4. Regenerar índices: `build_admin_index.py` + `build_related.py`
5. Commit: `chore(data): cleanup PT-PT vocab + voseu across vols 03-08`

### Frente 2: PT mirror JP — bijeção 1:1 nos parágrafos (mais demorado)

**Problema**: PT tem mais ou menos parágrafos que JP em muitas entries.

Exemplo concreto: `johreivol03_05` (sub a de "1. O Mecanismo..."):
- JP: 1 parágrafo (sem `\n\n`, fluxo único)
- PT: 5 parágrafos (quebrados pelo tradutor)

**Diagnóstico programático** (rodar no início):
```python
import json, glob
for path in sorted(glob.glob('data/johrei_vol*_bilingual.json')):
    if 'bak' in path: continue
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list): continue
    
    mismatches = []
    for e in data:
        pt_n = len([p for p in (e.get('content_pt','') or '').split('\n\n') if p.strip()])
        jp_n = len([p for p in (e.get('content_jp','') or '').split('\n\n') if p.strip()])
        if pt_n != jp_n and pt_n > 0 and jp_n > 0:
            mismatches.append({'id': e['id'], 'title': (e.get('title_pt','') or '')[:50], 'pt': pt_n, 'jp': jp_n})
    print(f"{path}: {len(mismatches)} entries with broken bijection")
    for m in mismatches[:5]:
        print(f"  [{m['id']}] PT={m['pt']} JP={m['jp']} - {m['title']}")
```

**Estratégias de fix por entry** (rank por ordem de preferência):

#### Estratégia A — Quando JP = 1 e PT > 1: JOIN PT
PT tinha quebras que o tradutor inseriu, mas JP é 1 bloco. Honra JP: junta tudo em 1 parágrafo.
- Risco: perde quebras semânticas no PT
- Ação: `e['content_pt'] = e['content_pt'].replace('\n\n', ' ').replace('  ', ' ')` (ou usar `\n` simples como break suave)

#### Estratégia B — Quando JP > 1 e PT > 1 mas counts diferem: Manual
JP tem N quebras, PT tem M. Se N != M, intervenção manual exige saber quais parágrafos PT consolidar para alinhar com cada JP.
- Não automatizar — flag pra revisão manual
- Sugestão: gerar relatório `data/_bijection_audit.json` com pares JP/PT lado a lado, índices, contagens. Usuário revisa uma a uma.

#### Estratégia C — Quando JP source MD tem quebras que se perderam no merge_jp
Re-extrair JP do source MD respeitando paragraphs. Re-rodar `scripts/merge_jp_volNN.py` para vols com bijeção quebrada. **Verificar se o JP MD original tem `\n\n` em pontos que correspondem aos breaks do PT** — se sim, é problema do extrator, não do dado.

**Ação para próxima sessão**:
1. Rodar diagnóstico — gerar `_bijection_audit.json` por volume
2. Para vol 02 (já v2 calibrado) — sanity check, deve ser 100% aligned
3. Para vol 03 (gold standard) — investigar quebras quebradas, aplicar Estratégia C primeiro (re-extract JP do MD), depois A para casos restantes
4. Para vols 04, 06 (já v2) — mesma ordem
5. Vols 05, 07, 08, 09, 10 (sem v2) — postpone até Frente 3

### Frente 3: Schema v2 upgrade vols 05/07/08/09/10

Vols sem schema v2 atualmente:
- vol 05 (39 entries)
- vol 07 (45)
- vol 08 (67)
- vol 09 (62)
- vol 10 (97)

Cada um tem entries `imported_*` (artifacts de import — section headers misturados como entradas vazias, duplicatas).

**Skill**: `johrei-volume-processor` em `~/.claude/skills/johrei-volume-processor/SKILL.md` documenta o pipeline (8 steps).

**Estratégia para essa frente sem retraduzir**:
1. Auditoria do vol — listar `imported_*`, duplicatas, headers
2. Mapping manual: legacy_id → (chapter, section, article, sub_letter)
3. Adapter de `merge_vol03_v2.py` → `merge_vol{NN}_v2.py`
4. Run merge: drops imported, adiciona schema v2 fields, sorts hierárquico, renumera IDs
5. Run JP merger se necessário (`merge_jp_vol{NN}.py`)
6. Regenerar índices
7. Commit per vol

Tempo: ~45-90min por vol (sem retradução). 5 vols = 4-8h total, distribuído em sessões separadas.

---

## Ordem recomendada para próximas sessões

### Sessão 1 (~30min) — PT-PT cleanup
- Frente 1 — script + apply nos 6 vols
- Validar amostras vol 07
- Commit

### Sessão 2 (~1h) — Bijeção diagnóstico + vol 02 sanity
- Frente 2 step 1: diagnóstico programático
- Verificar vol 02 (deve estar limpo)
- Investigar 1-2 entries de vol 03 com bijeção quebrada
- Decidir estratégia caso a caso (A vs B vs C)

### Sessão 3 (~1h) — Bijeção vol 03 + 04 + 06
- Aplicar fixes nas entries identificadas
- Re-validar
- Commit per vol

### Sessões 4-8 (~1h cada) — Schema v2 upgrade
- Sessão 4: vol 05
- Sessão 5: vol 07
- Sessão 6: vol 08
- Sessão 7: vol 09
- Sessão 8: vol 10

---

## Arquivos / scripts referência

- `Prompt_Traduca_v2.md` — calibração §1.4.1-10 e checklist §6
- `scripts/ingest_v2_pt.py` — parser PT MD → entries
- `scripts/merge_vol03_v2.py` — template merge per vol
- `scripts/merge_jp_vol03.py` — JP merger template
- `scripts/migration/build_admin_index.py` — regenerar índice admin
- `scripts/migration/build_related.py` — recompute related items
- `Markdown/MD_PT_v2/Johrei_Ho_Kohza_3_v2_PATCH.md` — exemplo de hierarquia MD correta
- `Markdown/MD_Original/浄霊法講座N.md` — JP source per volume

## Como invocar a skill

Próxima sessão pode usar: `Skill("johrei-volume-processor")` — encapsula pipeline + protocolo de calibração.

## Comandos úteis

```bash
# Servidor local
python -m http.server 8004

# Diagnóstico de bijeção (rodar primeiro na sessão)
python -c "
import json, glob
for path in sorted(glob.glob('data/johrei_vol*_bilingual.json')):
    if 'bak' in path: continue
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, list): continue
    mismatches = sum(1 for e in data if 
        len([p for p in (e.get('content_pt','') or '').split('\n\n') if p.strip()]) !=
        len([p for p in (e.get('content_jp','') or '').split('\n\n') if p.strip()])
        and (e.get('content_pt') or '').strip() and (e.get('content_jp') or '').strip())
    print(f'{path}: {mismatches} entries with broken bijection out of {len(data)}')
"

# Diagnóstico PT-PT
# (regex já no plano, frente 1)
```
