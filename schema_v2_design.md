# Design — Schema v2 dos cards de ensinamento

> Status: **rascunho para revisão**. Nada implementado ainda. Decisões abertas marcadas como `🟡 DECIDIR`.

## Objetivo

Enriquecer o JSON de ensinamentos para preservar a **estrutura hierárquica** do Markdown original
(volume → seção → artigo → subitem) que hoje é perdida na ingestão. Cards atuais ficam órfãos
sem o cabeçalho de seção e sem ligação com seus irmãos `(a)(b)(c)`.

Mantém retrocompatibilidade: todos os campos atuais permanecem; só adicionamos campos novos.

## Novos campos

| Campo | Tipo | Obrigatório | Exemplo | Descrição |
|---|---|---|---|---|
| `volume` | string | sim | `"Johrei Hô Kohza"` | Nome do volume/coletânea |
| `volume_num` | int | sim | `3` | Número do volume |
| `section_num` | string \| null | sim | `"II"` | Numeração romana da seção. `null` quando o volume não tem seções |
| `section_title` | string \| null | sim | `"Formas e Métodos de Johrei"` | Título da seção sem o numeral |
| `article_num` | int \| null | sim | `1` | Posição do artigo dentro da seção (1-indexado). `null` para introdução de seção |
| `article_title` | string | sim | `"O Maior Treino para Dominar a Arte Médica do Johrei é Retirar a Força"` | Título "limpo" do artigo, sem subletra |
| `sub_letter` | string \| null | sim | `"c"` | Letra do subitem `a`/`b`/`c`/… `null` quando não é subitem |
| `position` | int | sim | `7` | Ordem sequencial absoluta dentro do volume (1-indexado). Permite leitura linear |
| `parent_id` | string \| null | sim | `"johreivol03_04"` | ID do card-pai quando é subitem; `null` caso contrário |
| `source_ref` | object | sim | `{ "name": "Goshū", "issue": 2, "page": 71 }` | Fonte estruturada (substitui/complementa `info_pt` em texto livre) |

`info_pt`/`source` (texto livre) continuam existindo, gerados a partir de `source_ref` para
retrocompatibilidade do leitor.

## Exemplo concreto (BEFORE / AFTER)

### BEFORE — `johreivol03_07` hoje

```json
{
  "id": "johreivol03_07",
  "title_pt": "Sobre relaxar a força (C)",
  "title_jp": "...",
  "content_pt": "Ao fazer assim (Johrei), se acharem que a cura está má...",
  "tags": [],
  "info_pt": "Goshū n.º 15, pág. 55",
  "source": "Goshū n.º 15, pág. 55",
  "Master_Title": "..."
}
```

Quem lê isso isolado não sabe que:
- está dentro da seção **II — Formas e Métodos de Johrei**
- é o subitem **(c)** do artigo **II.1 "Retirar a Força"**
- tem 4 irmãos `(a)(b)(d)(e)` e 1 pai (`_04`)
- vem na 7ª posição do volume

### AFTER — `johreivol03_07` v2

```json
{
  "id": "johreivol03_07",
  "volume": "Johrei Hô Kohza",
  "volume_num": 3,
  "section_num": "II",
  "section_title": "Formas e Métodos de Johrei",
  "article_num": 1,
  "article_title": "O Maior Treino para Dominar a Arte Médica do Johrei é Retirar a Força",
  "sub_letter": "c",
  "position": 7,
  "parent_id": "johreivol03_04",
  "source_ref": { "name": "Goshū", "issue": 15, "page": 55 },

  "title_pt": "Sobre relaxar a força (C)",
  "title_jp": "...",
  "content_pt": "Ao fazer assim (Johrei), se acharem que a cura está má...",
  "tags": [],
  "info_pt": "Goshū n.º 15, pág. 55",
  "source": "Goshū n.º 15, pág. 55",
  "Master_Title": "..."
}
```

Agora dá para renderizar:

> **Vol 3 › II. Formas e Métodos de Johrei › 1. Retirar a Força › (c)**
> *Goshū n.º 15, pág. 55*

E navegar irmão↔irmão sem precisar de campo extra (basta consultar `parent_id` igual).

## Casos de borda (regras)

1. **Introdução de seção sem numeração de artigo** (ex.: parágrafo inicial da seção IV antes do artigo IV.1):
   `article_num=null`, `sub_letter=null`. O `position` ainda existe para colocar na ordem certa.
2. **Volume sem hierarquia (raro)**: `section_num=null`, `section_title=null`, `article_num=null`. O `position` linear ainda funciona.
3. **Subitem sem irmãos** (artigo com só um `(a)`): mantém `sub_letter="a"` mesmo assim — semântica do MD original.
4. **Pai de subitens sem corpo próprio** (artigo só com cabeçalho e depois `(a)(b)(c)`): existe um card-pai com `content_pt=""` ou um parágrafo curto, e `sub_letter=null`. Os filhos apontam pra ele via `parent_id`.

## Impacto no código

| Arquivo | Mudança | Esforço |
|---|---|---|
| `scripts/migration/*.py` | Atualizar parser do MD para emitir campos hierárquicos | médio |
| `data/*_bilingual.json` | Re-gerar todos com schema v2 | automático (script) |
| `js/core.js#loadData()` | Nada (campos extras são ignorados) | nenhum |
| `js/filters.js` | Opcional: adicionar filtro por seção | pequeno |
| `js/render.js` (cards) | Opcional: mostrar breadcrumb no card | pequeno |
| `data/admin_index.json` | Re-gerar com `build_admin_index.py` | automático |
| `data/related_v2.json` | Re-gerar | automático |

Renderizador atual continua funcionando sem mudança. Os campos novos são puro ganho.

## 🟡 Decisões abertas (precisam da sua resposta)

### D1. Romanização canônica de 御教え集

- **Atual nas primárias**: `Mioshie-shū` (ex.: "Mioshie-shu nº 11, pág. 5")
- **Atual nas imported**: `Goshū` (ex.: "Goshū n.º 11, pág. 5")
- **Doutrinariamente**: 御教え集 lê-se *Mioshie-shū* (a leitura "Goshū" 御集 é outra coisa)

**Sugestão**: padronizar como **`Mioshie-shū`**. Aplico em todos os dados (primárias estão certas, imported precisariam mudar — mas vão ser substituídas pela retradução mesmo).

### D2. Granularidade dos subitens `(a)(b)(c)…`

- **Hoje**: cada subitem é um card separado. Ex.: `johreivol03_05/06/07/08/09` para os 5 subcasos de "Retirar a Força".
- **Alternativa A**: manter um card por subitem (status quo). Bom para busca/filtragem; cada subitem tem fonte própria.
- **Alternativa B**: colapsar em um card único com os subitens como seções internas do `content_pt`. Bom para leitura contínua; ruim para granularidade de busca.

**Sugestão**: manter **Alternativa A** (1 card por subitem) + adicionar `parent_id` + `sibling_ids` computados via parent_id em runtime. O leitor pode mostrar agrupado ou separado conforme contexto.

### D3. Card-pai vazio

Quando o artigo tem só cabeçalho + subitens (sem parágrafo introdutório próprio), criamos um card-pai com `content_pt=""` para servir de âncora hierárquica?

- **Sim**: estrutura uniforme, todo subitem tem parent. Renderizador filtra cards vazios da listagem.
- **Não**: subitens apontam direto pro `section_title` via `parent_id=null` mas com `article_title` preenchido. Mais leve, menos consistente.

**Sugestão**: **Sim** (criar pai vazio). Custo é desprezível (1 entrada por artigo) e o modelo fica regular.

### D4. Filtragem por seção na UI?

Adicionar dropdown "Seção" nos filtros agora, ou deixar para depois?

**Sugestão**: deixar para depois. Schema v2 habilita; UI pode ser feita num PR separado quando houver retorno do uso.

### D5. ID dos novos cards (após retradução)

Os 13 imported únicos + 1 artigo faltante (II.14 cadeiras) precisam de IDs. Opções:

- **A**: `johreivol03_25`, `_26`, …, `_38` (sequencial, simples)
- **B**: `johreivol03_II_8`, `johreivol03_II_14_a`, … (semântico, reflete posição)

**Sugestão**: **(A) sequencial**. IDs são identificadores estáveis; a posição já vai para `position`/`section_num`/`article_num`. Misturar semântica no ID acopla demais.

---

## Próximo passo (se aprovar)

1. Você responde D1–D5 (ou aceita sugestões em bloco).
2. Eu adapto o `Prompt Traduca` para emitir MD que case com este schema (cabeçalhos `## I.`, `### 1.`, `#### (a)` claros + bloco de fonte estruturado).
3. Eu atualizo o script de migração para popular os novos campos.
4. Você roda a retradução do `johrei_vol03` (volume piloto) para validar.
5. Se ok, replicamos para os demais volumes.
