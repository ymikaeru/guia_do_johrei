# Data Folder Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limpar a pasta `data/` removendo backups antigos e movendo arquivos recentes para `BKP/`, sem alterar nenhum caminho ativo.

**Architecture:** Operações puras de sistema de arquivos — delete + move. Nenhum código de frontend ou script é alterado.

**Tech Stack:** PowerShell (Windows), git

---

### Task 1: Deletar backups antigos (45 arquivos)

**Files:**
- Delete: `data/estudo_aprofundado_*.json.bak.pre_tags.20260502_125106` (37 arquivos)
- Delete: `data/pontos_focais_vol02_bilingual.json.bak.20260502_124504`
- Delete: `data/pontos_focais_vol02_bilingual.json.bak.20260502_133459`
- Delete: `data/tab_fundamentos.json.bak.before_v5_20260523_132044`
- Delete: `data/tab_fundamentos.json.bak.before_v5_20260523_132146`
- Delete: `data/tab_fundamentos.json.bak.before_v5_20260523_132232`
- Delete: `data/tab_fundamentos.json.bak.before_v5_20260523_133833`
- Delete: `data/tab_fundamentos.json.bak.before_v5_20260523_134053`
- Delete: `data/.DS_Store`

- [ ] **Step 1: Deletar os 37 backups pre_tags**

```powershell
Remove-Item "data\estudo_aprofundado_*.bak.pre_tags.20260502_125106"
```

- [ ] **Step 2: Deletar backups pontos_focais**

```powershell
Remove-Item "data\pontos_focais_vol02_bilingual.json.bak.20260502_124504"
Remove-Item "data\pontos_focais_vol02_bilingual.json.bak.20260502_133459"
```

- [ ] **Step 3: Deletar backups before_v5**

```powershell
Remove-Item "data\tab_fundamentos.json.bak.before_v5_20260523_132044"
Remove-Item "data\tab_fundamentos.json.bak.before_v5_20260523_132146"
Remove-Item "data\tab_fundamentos.json.bak.before_v5_20260523_132232"
Remove-Item "data\tab_fundamentos.json.bak.before_v5_20260523_133833"
Remove-Item "data\tab_fundamentos.json.bak.before_v5_20260523_134053"
```

- [ ] **Step 4: Deletar .DS_Store**

```powershell
Remove-Item "data\.DS_Store"
```

- [ ] **Step 5: Verificar que os arquivos ativos ainda existem**

```powershell
Test-Path "data\tab_fundamentos.json"   # deve retornar True
Test-Path "data\tab_pratica.json"       # deve retornar True
Test-Path "data\guia_atendimento.json"  # deve retornar True
```

- [ ] **Step 6: Commit**

```bash
git add -A data/
git commit -m "chore(data): delete old .bak files from May 2-23"
```

---

### Task 2: Mover backups recentes e arquivos de pipeline para `BKP/`

**Files:**
- Move: `data/tab_fundamentos.json.bak` → `data/BKP/`
- Move: `data/tab_fundamentos.json.bak.retrad` → `data/BKP/`
- Move: `data/tab_pratica.json.bak` → `data/BKP/`
- Move: `data/tab_pratica.json.bak.retrad` → `data/BKP/`
- Move: `data/tab_critica_farmacologica.json.bak` → `data/BKP/`
- Move: `data/tab_por_regiao.json.bak` → `data/BKP/`
- Move: `data/_retrad_pending.json` → `data/BKP/`
- Move: `data/_retrad_results.json` → `data/BKP/`

- [ ] **Step 1: Mover os .bak recentes**

```powershell
Move-Item "data\tab_fundamentos.json.bak" "data\BKP\"
Move-Item "data\tab_fundamentos.json.bak.retrad" "data\BKP\"
Move-Item "data\tab_pratica.json.bak" "data\BKP\"
Move-Item "data\tab_pratica.json.bak.retrad" "data\BKP\"
Move-Item "data\tab_critica_farmacologica.json.bak" "data\BKP\"
Move-Item "data\tab_por_regiao.json.bak" "data\BKP\"
```

- [ ] **Step 2: Mover arquivos de pipeline**

```powershell
Move-Item "data\_retrad_pending.json" "data\BKP\"
Move-Item "data\_retrad_results.json" "data\BKP\"
```

- [ ] **Step 3: Confirmar que pasta raiz está limpa**

```powershell
Get-ChildItem "data\" -Name "*.bak*"     # deve retornar vazio
Get-ChildItem "data\" -Name "_retrad_*"  # deve retornar vazio
```

- [ ] **Step 4: Commit**

```bash
git add -A data/
git commit -m "chore(data): move recent .bak and retrad files to BKP/"
```
