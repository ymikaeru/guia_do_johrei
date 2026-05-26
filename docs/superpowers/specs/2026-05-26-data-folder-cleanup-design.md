# Design: Limpeza da pasta data/

**Data:** 2026-05-26
**Status:** Aprovado

## Problema

A pasta `data/` acumulou 3 tipos de lixo misturados com arquivos ativos:
- 45 backups antigos (`.bak.pre_tags.*`, `.bak.before_v5_*`, `.bak.20260502_*`) criados por scripts de migração em maio
- 8 arquivos recentes (`.bak`, `.bak.retrad`, `_retrad_*.json`) do pipeline de hoje (26/mai)
- 1 artefato de macOS (`.DS_Store`)

## Decisão

**Abordagem B — Deletar antigos, mover recentes para `BKP/`**

Sem alterar subpastas, caminhos de scripts ou frontend. Apenas limpeza de arquivos temporários.

## O que será deletado (45 arquivos)

| Grupo | Qtd | Critério |
|---|---|---|
| `estudo_aprofundado_*.bak.pre_tags.20260502_125106` | 37 | Backups de 02/mai, cobertos pelo git e versões atuais |
| `pontos_focais_vol02_bilingual.json.bak.20260502_*` | 2 | Mesma data e razão |
| `tab_fundamentos.json.bak.before_v5_20260523_*` | 5 | Backups de 23/mai, estado atual é mais novo |
| `.DS_Store` | 1 | Artefato do macOS |

## O que será movido para `BKP/` (8 arquivos)

- `tab_fundamentos.json.bak` + `.bak.retrad`
- `tab_pratica.json.bak` + `.bak.retrad`
- `tab_critica_farmacologica.json.bak`
- `tab_por_regiao.json.bak`
- `_retrad_pending.json`
- `_retrad_results.json`

Critério: criados hoje (26/mai), podem ser úteis para depuração nos próximos dias.

## O que não muda

Todos os arquivos ativos na raiz de `data/` permanecem no lugar:
- `tab_*.json` (lidos pelo frontend via Supabase)
- `*_bilingual.json` (fontes dos scripts de build)
- `guia_atendimento.json`, `related_v2.json`, `synonyms_pt.json`, `index.json`
- `culto_mensal_atual.md` + `.timestamps.json`

Nenhum caminho de script ou frontend é alterado.

## Fora do escopo

- Separar `src/` vs `compiled/` — exigiria refatorar caminhos em scripts e frontend
- Organizar `BKP/` — já existe e é tratada como área de descarte
