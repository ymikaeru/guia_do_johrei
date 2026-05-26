#!/usr/bin/env python3
"""
Retraduz artigos do Guia do Johrei com bijeção paragráfica 1:1.

Adaptado de mioshie_college_offline/scripts/retranslate_suspicious.py.

Fluxo:
  1. SCAN — varre data/tab_*.json e identifica artigos com mismatch
     paragráfico PT != JP
  2. SAVE — salva lista em data/_retrad_pending.json (para revisão)
  3. TRANSLATE — manda em batches pro Gemini com prompt que força
     bijeção ¶N. Salva resultado bruto em data/_retrad_results.json
  4. APPLY — valida bijeção, faz backup dos tab_*.json originais e
     substitui o conteudo/content_pt apenas dos artigos com bijeção
     validada.

Modos:
  python scripts/gemini_retraduzir_guia.py scan       # só scan
  python scripts/gemini_retraduzir_guia.py translate  # só translate
  python scripts/gemini_retraduzir_guia.py apply      # só apply
  python scripts/gemini_retraduzir_guia.py all        # scan + translate + apply
"""

import os
import sys
import json
import re
import time
import shutil
import google.generativeai as genai

# ─── Config ──────────────────────────────────────────────────────────────────

DATA_DIR = "data"
PROMPT_FILE = "scripts/PROMPT_RETRADUCAO_GUIA.md"
PENDING_JSON = "data/_retrad_pending.json"
RESULTS_JSON = "data/_retrad_results.json"

# Schemas por tab (campo PT, campo JP)
TAB_SCHEMAS = {
    "tab_fundamentos.json":           ("conteudo",   "conteudo_jp"),
    "tab_pratica.json":               ("conteudo",   "conteudo_jp"),
    "tab_critica_farmacologica.json": ("conteudo",   "conteudo_jp"),
    "tab_por_regiao.json":            ("conteudo",   "conteudo_jp"),
    "tab_estudo_aprofundado.json":    ("content_pt", "content_jp"),
    "tab_estudo_detalhado.json":      ("content_pt", "content_jp"),
}

BATCH_SIZE = 4              # artigos por chamada API (conservador pra começar)
INTER_BATCH_DELAY = 2       # segundos entre batches
MODEL_NAME = "gemini-3.1-pro-preview"

# ─── Helpers ─────────────────────────────────────────────────────────────────

def number_paragraphs(text):
    """Converte texto com `\n\n` em formato `¶1\n[txt]\n\n¶2\n[txt]\n\n...`"""
    paras = re.split(r'\n\n+', (text or '').strip())
    return '\n\n'.join(f'¶{i+1}\n{p}' for i, p in enumerate(paras)), len(paras)


def parse_numbered_response(text, expected_n):
    """
    Extrai parágrafos do output formato `¶1\n[txt]\n\n¶2\n[txt]\n\n...`
    Retorna (paragraphs_list, ok_bool). ok=True se o count bate.
    """
    if not text:
        return [], False
    # Remove markers ¶N + captura texto até próximo ¶N
    paragraphs = re.findall(r'¶\d+\s*\n([\s\S]*?)(?=\n+¶\d+|\Z)', text.strip())
    paragraphs = [p.strip() for p in paragraphs if p.strip()]
    return paragraphs, len(paragraphs) == expected_n


def iter_articles(tab_json):
    """Yields (article, path=[s,c,a]) for each artigo in a tab JSON."""
    for s, sub in enumerate(tab_json.get('sub_abas', [])):
        for c, cat in enumerate(sub.get('categorias', [])):
            for a, art in enumerate(cat.get('artigos', [])):
                yield art, [s, c, a]


# ─── Step 1: Scan ────────────────────────────────────────────────────────────

def scan_mismatches():
    """Encontra artigos com PT paragraph count != JP paragraph count."""
    pending = []
    for fname, (pt_field, jp_field) in TAB_SCHEMAS.items():
        fpath = os.path.join(DATA_DIR, fname)
        if not os.path.exists(fpath):
            print(f"  ⚠ {fname}: arquivo não existe, pulando")
            continue
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        tab_count = 0
        for art, path in iter_articles(data):
            pt = (art.get(pt_field) or '').strip()
            jp = (art.get(jp_field) or '').strip()
            if not pt or not jp:
                continue
            pt_paras = re.split(r'\n\n+', pt)
            jp_paras = re.split(r'\n\n+', jp)
            if len(pt_paras) == len(jp_paras):
                continue
            jp_numbered, jp_n = number_paragraphs(jp)
            pending.append({
                "tab_file": fname,
                "article_id": art.get('id', ''),
                "article_title": art.get('titulo') or art.get('title_pt') or '',
                "title_jp": art.get('title_jp', ''),
                "path": path,
                "pt_field": pt_field,
                "jp_field": jp_field,
                "pt_n": len(pt_paras),
                "jp_n": jp_n,
                "content_jp_numbered": jp_numbered,
            })
            tab_count += 1
        if tab_count:
            print(f"  {fname}: {tab_count} mismatches")
    print(f"\nTotal: {len(pending)} artigos com mismatch")
    return pending


def collect_full_tab(tab_file):
    """Coleta TODOS os artigos de um tab_*.json para retradução, sem filtrar por mismatch."""
    schema = TAB_SCHEMAS.get(tab_file)
    if not schema:
        print(f"  ⚠ {tab_file} não está em TAB_SCHEMAS")
        return []
    pt_field, jp_field = schema
    fpath = os.path.join(DATA_DIR, tab_file)
    if not os.path.exists(fpath):
        print(f"  ⚠ {fpath} não existe")
        return []
    with open(fpath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    pending = []
    for art, path in iter_articles(data):
        pt = (art.get(pt_field) or '').strip()
        jp = (art.get(jp_field) or '').strip()
        if not jp:
            continue
        pt_paras = re.split(r'\n\n+', pt) if pt else []
        jp_numbered, jp_n = number_paragraphs(jp)
        pending.append({
            "tab_file": tab_file,
            "article_id": art.get('id', ''),
            "article_title": art.get('titulo') or art.get('title_pt') or '',
            "title_jp": art.get('title_jp', ''),
            "path": path,
            "pt_field": pt_field,
            "jp_field": jp_field,
            "pt_n": len(pt_paras),
            "jp_n": jp_n,
            "content_jp_numbered": jp_numbered,
        })
    print(f"  {tab_file}: {len(pending)} artigos coletados (retradução completa)")
    return pending


def save_pending(pending):
    with open(PENDING_JSON, 'w', encoding='utf-8') as f:
        json.dump(pending, f, ensure_ascii=False, indent=2)
    print(f"Salvo em {PENDING_JSON}")


# ─── Step 2: Translate ───────────────────────────────────────────────────────

def setup_model():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Defina GEMINI_API_KEY no ambiente")
    genai.configure(api_key=api_key)
    with open(PROMPT_FILE, 'r', encoding='utf-8') as f:
        system_instruction = f.read()
    return genai.GenerativeModel(
        model_name=MODEL_NAME,
        system_instruction=system_instruction,
        generation_config=genai.types.GenerationConfig(
            temperature=0.3,
            response_mime_type="application/json",
        ),
        safety_settings={
            genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
        }
    )


def translate_batch(model, batch):
    """Envia um batch ao Gemini, devolve lista de items traduzidos."""
    items = []
    for p in batch:
        items.append({
            "id": p["article_id"],
            "title_jp": p["title_jp"],
            "title_pt_atual": p["article_title"],
            "content_jp_numbered": p["content_jp_numbered"],
        })
    payload = json.dumps({"items": items}, ensure_ascii=False)
    try:
        response = model.generate_content(payload, request_options={"timeout": 600})
        text = (response.text or '').strip()
        if text.startswith("```"):
            text = re.sub(r'^```[a-z]*\n?', '', text)
            text = re.sub(r'\n?```$', '', text)
        return json.loads(text)
    except Exception as e:
        print(f"  ❌ API error: {e}")
        return []


def translate_all(pending, batch_size=BATCH_SIZE, limit=None):
    if limit:
        pending = pending[:limit]
        print(f"  (limitando a {limit} artigos pra teste)")
    model = setup_model()
    all_results = []
    total = len(pending)
    for i in range(0, total, batch_size):
        batch = pending[i:i + batch_size]
        n_total = (total + batch_size - 1) // batch_size
        print(f"  Batch {i//batch_size + 1}/{n_total} ({len(batch)} artigos)...")
        results = translate_batch(model, batch)
        if results:
            # Anexa metadados originais ao result pra apply
            by_id = {p["article_id"]: p for p in batch}
            for res in results:
                rid = res.get("id", "")
                src = by_id.get(rid)
                if src:
                    res["_tab_file"] = src["tab_file"]
                    res["_path"]     = src["path"]
                    res["_pt_field"] = src["pt_field"]
                    res["_jp_n"]     = src["jp_n"]
            all_results.extend(results)
            print(f"    ✅ {len(results)} resultados")
        else:
            print(f"    ⚠ batch vazio")
        if i + batch_size < total:
            time.sleep(INTER_BATCH_DELAY)
    with open(RESULTS_JSON, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\nSalvo {len(all_results)} resultados em {RESULTS_JSON}")
    return all_results


# ─── Step 3: Apply (com validação de bijeção) ────────────────────────────────

def apply_translations(results, force=False):
    # Group por tab_file
    by_tab = {}
    for r in results:
        tf = r.get('_tab_file', '')
        if tf:
            by_tab.setdefault(tf, []).append(r)

    summary = {"applied": 0, "skipped_bijection": 0, "skipped_no_path": 0, "tabs_touched": []}

    for tab_file, items in by_tab.items():
        fpath = os.path.join(DATA_DIR, tab_file)
        if not os.path.exists(fpath):
            print(f"  ⚠ {tab_file} não existe")
            continue
        # Backup
        bak = fpath + '.bak.retrad'
        if not os.path.exists(bak):
            shutil.copy(fpath, bak)
            print(f"  💾 Backup: {bak}")
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        applied = 0
        for r in items:
            path = r.get('_path')
            pt_field = r.get('_pt_field', 'conteudo')
            jp_n = r.get('_jp_n', 0)
            numbered = r.get('content_ptbr_numbered', '')
            if not path or not numbered:
                summary["skipped_no_path"] += 1
                continue
            paragraphs, ok = parse_numbered_response(numbered, jp_n)
            if not ok and not force:
                print(f"  ⚠ {r.get('id','')}: bijeção falhou (esperava {jp_n}, recebeu {len(paragraphs)}) — pulando")
                summary["skipped_bijection"] += 1
                continue
            new_content = '\n\n'.join(paragraphs)
            try:
                s, c, a = path
                data['sub_abas'][s]['categorias'][c]['artigos'][a][pt_field] = new_content
                # Também atualiza title se vier
                new_title = r.get('title_ptbr', '').strip()
                if new_title:
                    tfield = 'titulo' if 'titulo' in data['sub_abas'][s]['categorias'][c]['artigos'][a] else 'title_pt'
                    data['sub_abas'][s]['categorias'][c]['artigos'][a][tfield] = new_title
                applied += 1
            except Exception as e:
                print(f"  ⚠ erro aplicando {r.get('id','')}: {e}")

        with open(fpath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  ✅ {tab_file}: {applied} artigos atualizados")
        summary["applied"] += applied
        summary["tabs_touched"].append(tab_file)

    print(f"\n━━ Resumo apply ━━")
    print(f"  Aplicados:                {summary['applied']}")
    print(f"  Pulados (bijeção falhou): {summary['skipped_bijection']}")
    print(f"  Pulados (sem path):       {summary['skipped_no_path']}")
    print(f"  Tabs atualizadas:         {len(summary['tabs_touched'])}")


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])
    force = "--force" in sys.argv
    full_tab = None
    if "--full-tab" in sys.argv:
        idx = sys.argv.index("--full-tab")
        if idx + 1 < len(sys.argv):
            full_tab = sys.argv[idx + 1]

    # cwd = guia_johrei root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    os.chdir(repo_root)

    if mode in ("scan", "all"):
        if full_tab:
            print(f"=== Step 1: coletar todos os artigos de {full_tab} ===")
            pending = collect_full_tab(full_tab)
        else:
            print("=== Step 1: scan mismatches ===")
            pending = scan_mismatches()
        save_pending(pending)
        if not pending:
            print("Nada para fazer.")
            return

    if mode in ("translate", "all"):
        print("\n=== Step 2: translate via Gemini ===")
        with open(PENDING_JSON, 'r', encoding='utf-8') as f:
            pending = json.load(f)
        translate_all(pending, limit=limit)

    if mode in ("apply", "all"):
        print("\n=== Step 3: validar bijeção + aplicar no JSON ===")
        with open(RESULTS_JSON, 'r', encoding='utf-8') as f:
            results = json.load(f)
        apply_translations(results, force=force)

    print("\n✅ Done")


if __name__ == "__main__":
    # Uso:
    #   python scripts/gemini_retraduzir_guia.py scan
    #   python scripts/gemini_retraduzir_guia.py scan --full-tab tab_fundamentos.json
    #   python scripts/gemini_retraduzir_guia.py translate --limit 5
    #   python scripts/gemini_retraduzir_guia.py apply
    #   python scripts/gemini_retraduzir_guia.py all
    #   python scripts/gemini_retraduzir_guia.py all --full-tab tab_fundamentos.json
    #   python scripts/gemini_retraduzir_guia.py apply --force   # ignora bijeção
    main()
