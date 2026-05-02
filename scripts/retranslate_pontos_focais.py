"""
retranslate_pontos_focais.py
Retranslates pontos_focais_volNN_bilingual.json using Gemini API.
Only updates title_pt and content_pt. All other fields (focusPoints, tags,
id, content_jp, etc.) are preserved unchanged to keep the Mapa working.

Uses Prompt_Traduca_v2.md as the doctrinal base (§1 style, §2 glossary, §3 sources).
Overrides §4 output format — 各論 entries are plain paragraphs + [Pontos de Johrei].

Usage:
    python scripts/retranslate_pontos_focais.py --vol 1 [--dry-run] [--start N] [--end N]
    python scripts/retranslate_pontos_focais.py --vol 2 [--dry-run]
"""

import json
import time
import argparse
import sys
import os
import re
import shutil
from datetime import datetime
import google.generativeai as genai

API_KEY = os.environ.get("GEMINI_API_KEY", "AIzaSyAEHze_13AHkj0d4_C07TFudUuajiTrgeg")
MODEL   = "gemini-3.1-pro-preview"

# ── Load base prompt from Prompt_Traduca_v2.md (sections §1, §2, §3 only) ──
def load_base_prompt(project_root: str) -> str:
    prompt_path = os.path.join(project_root, "Prompt_Traduca_v2.md")
    try:
        with open(prompt_path, encoding="utf-8") as f:
            text = f.read()
        # Extract sections 1, 2, 3 — stop before §4 (FORMAT DE SAÍDA)
        match = re.split(r'\n## 4\.', text)
        return match[0].strip()
    except FileNotFoundError:
        return ""

KAKURON_INSTRUCTIONS = """
---

## INSTRUÇÕES ESPECÍFICAS PARA ESTE CONTEXTO (各論 — Pontos de Johrei)

Você está traduzindo entradas da obra **各論 (Kakuron)** — um compêndio das purificações específicas que Meishu-Sama ensinou, com os respectivos pontos de Johrei. Cada entrada descreve uma condição, sua causa espiritual/doutrinária e os locais corporais onde ministrar Johrei.

### Formato de saída obrigatório

1. **Parágrafos livres** — sem cabeçalhos `##`, `###`, `####`. Apenas texto em parágrafos separados por linha em branco.
2. **Diálogo Q&A** (quando presente): use `**(Pergunta)**` e `**(Meishu-sama)**` em negrito.
3. **Bloco final de Pontos de Johrei**: quando o texto original terminar com `〔浄霊個所〕` ou `〔浄霊箇所〕` seguido de lista, traduza como:

   ```
   **[Pontos de Johrei]**
   Alto da cabeça (bregma), região occipital, glândulas linfáticas cervicais, ombros, rins.
   ```

   **OBRIGATÓRIO**: a lista fica em **uma única linha**, itens separados por vírgula — **nunca use marcadores de lista** (*, -, •).

### Anatomia — termos padronizados

| Japonês | PT canônico |
|---|---|
| 脳天 | **alto da cabeça (bregma)** — NUNCA "topo da cabeça" |
| 後頭部 | região occipital |
| 前頭部 | região frontal |
| 延髄 | bulbo raquidiano |
| 頸部淋巴腺 / 頸腺 | glândulas linfáticas cervicais |
| 耳下腺 | parótidas |
| 肩 | ombros |
| 腎臓 | rins |
| 小脳 | cerebelo |
| 臀部 | região glútea |
| 鼠蹊部 | região inguinal |
| こめかみ / 顳 | têmporas |
| 淋巴腺 | glândulas linfáticas |
| 患部 | região afetada |

### Título
Traduza o título de forma direta, sem parênteses adicionais.
- `頭痛` → `Dor de Cabeça` (não "Cefaleia (Dor de Cabeça)")
- `眩暈` → `Vertigem`
- `脳溢血－脳出血` → `Apoplexia Cerebral — Hemorragia Cerebral`

### Ajustes de registro (CRÍTICO)

**Voz ativa — evite construções passivas clínicas:**
- ❌ "ao inquirir sobre a etiologia, constata-se que" → ✅ "quanto à causa, a principal é"
- ❌ "observa-se que", "percebe-se", "constata-se" → ✅ voz ativa direta

**"Etiologia" apenas como substantivo isolado:**
- ✅ "A etiologia é dupla:" (OK como substantivo)
- ❌ "Sua etiologia divide-se em duas categorias:" → ✅ "As causas são de dois tipos:"
- ❌ qualquer construção com verbos sobre etiologia → use "causa"

**Termos corporais — evite os exclusivamente clínicos:**
- ❌ "exsudar", "exsudam" → ✅ "infiltrar-se", "vazar", "escorrer"
- ❌ "epiderme renal" → ✅ "superfície dos rins"
- ❌ "gânglios linfáticos" → ✅ "glândulas linfáticas" (terminologia canônica do projeto)
- ❌ "sangue intoxicado" → ✅ "sangue tóxico" (毒血 = sangue tóxico, conforme glossário §2)

**Concisão:** frases curtas no japonês devem permanecer curtas no português.
Não expanda construções simples do JP em períodos longos e elaborados no PT.

**North Star de registro:** releia esta frase antes de entregar — é o patamar exato:
> "Seja quem for — na medicina existem doutores, bacharéis e médicos práticos —, o importante é empenhar-se ao máximo para tornar-se, por assim dizer, um 'Doutor' nesta obra."
Se sua tradução soar mais formal ou clínica que isso, está acima do patamar. Ajuste.

### Saída
Retorne APENAS a tradução. Sem explicações, notas, nem marcadores de bloco de código.
"""

def build_system_prompt(project_root: str) -> str:
    base = load_base_prompt(project_root)
    if base:
        return base + "\n\n" + KAKURON_INSTRUCTIONS
    # Fallback if file not found
    return KAKURON_INSTRUCTIONS


def translate_entry(model, title_jp: str, content_jp: str) -> tuple[str, str]:
    """Translates title and content. Returns (title_pt, content_pt)."""

    title_response = model.generate_content(
        f"Traduza este título de condição (各論) do japonês para PT-BR. "
        f"Retorne APENAS o título traduzido, sem aspas nem explicação.\n\nTítulo: {title_jp}"
    )
    title_pt = title_response.text.strip().strip('"').strip("'").strip()

    content_response = model.generate_content(
        f"Traduza o seguinte texto sobre esta condição (各論) do japonês para PT-BR:\n\n{content_jp}"
    )
    content_pt = content_response.text.strip()

    # Strip echoed title from first line (model sometimes adds it)
    first_line = content_pt.split("\n")[0].strip().strip("*#").strip()
    if first_line.lower() == title_pt.lower():
        content_pt = content_pt[content_pt.index("\n"):].lstrip("\n")

    return title_pt, content_pt


def main():
    parser = argparse.ArgumentParser(description="Retranslate pontos_focais using Gemini")
    parser.add_argument("--vol", type=int, required=True, choices=[1, 2],
                        help="Volume to process (1 or 2)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Translate but don't write to disk (preview only)")
    parser.add_argument("--start", type=int, default=0,
                        help="Start index (0-based, inclusive)")
    parser.add_argument("--end", type=int, default=None,
                        help="End index (0-based, exclusive)")
    parser.add_argument("--delay", type=float, default=3.0,
                        help="Seconds between API calls (default 3.0)")
    args = parser.parse_args()

    # Resolve project root (script is at scripts/)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    vol_str = f"0{args.vol}" if args.vol < 10 else str(args.vol)
    json_path = os.path.join(project_root, "data", f"pontos_focais_vol{vol_str}_bilingual.json")

    if not os.path.exists(json_path):
        print(f"ERROR: {json_path} not found")
        sys.exit(1)

    print(f"Loading {json_path}...")
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    total  = len(data)
    start  = args.start
    end    = args.end if args.end is not None else total
    subset = data[start:end]
    print(f"Vol {args.vol}: {total} entries total. Processing [{start}:{end}] = {len(subset)} entries.")

    if not args.dry_run:
        bak = f"{json_path}.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        shutil.copy2(json_path, bak)
        print(f"Backup: {bak}")

    system_prompt = build_system_prompt(project_root)
    print(f"System prompt: {len(system_prompt)} chars (Prompt_Traduca_v2 + Kakuron instructions)")

    genai.configure(api_key=API_KEY)
    model = genai.GenerativeModel(
        model_name=MODEL,
        system_instruction=system_prompt
    )

    errors = []
    for i, entry in enumerate(subset):
        idx      = start + i
        eid      = entry.get("id", f"[{idx}]")
        title_jp = entry.get("title_jp", "").strip()
        content_jp = entry.get("content_jp", "").strip()

        print(f"\n[{idx+1}/{total}] {eid}")
        print(f"  JP title: {title_jp}")

        if not content_jp:
            print("  SKIP: empty content_jp")
            continue

        try:
            title_pt, content_pt = translate_entry(model, title_jp, content_jp)

            print(f"  PT title:   {title_pt}")
            print(f"  PT preview: {content_pt[:120].replace(chr(10), ' ')}...")

            if not args.dry_run:
                data[idx]["title_pt"]   = title_pt
                data[idx]["content_pt"] = content_pt

        except Exception as e:
            print(f"  ERROR: {e}")
            errors.append((eid, str(e)))

        if i < len(subset) - 1:
            time.sleep(args.delay)

    if not args.dry_run and not errors:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\nSaved: {json_path}")
    elif not args.dry_run and errors:
        print(f"\nWARNING: {len(errors)} errors — saving anyway (partial update).")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nDone. Errors: {len(errors)}")
    for eid, msg in errors:
        print(f"  {eid}: {msg}")


if __name__ == "__main__":
    main()
