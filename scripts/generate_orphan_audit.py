"""
generate_orphan_audit.py
========================
Generates data/_audit_articles_pergunta_sem_resposta.json.

Iterates every bilingual JSON in data/, finds articles that have a
"Pergunta" marker but no detectable answer marker, and saves them as
the audit.  Run from the repo root:

    python scripts/generate_orphan_audit.py

Output: data/_audit_articles_pergunta_sem_resposta.json
"""

import json
import glob
import re
import os
from collections import Counter


# ── Marker regexes (mirror js/ui.js parseEstudoSections) ─────────────────────

Q_MARKER = re.compile(
    r"(?:"
    r"\*\*\s*\(?\s*(?:Pergunta(?:\s+do\s+(?:Fiel|Ministrante))?|Interlocutor|Fala\s+do\s+[Ff]iel)\s*\)?\s*:?\s*\*\*"
    r"|Pergunta\s+do\s+(?:Fiel|Ministrante)"
    r"|Fala\s+do\s+[Ff]iel"
    r")",
    re.I,
)

A_STANDARD = re.compile(
    r"(?:"
    r"\*\*\s*\(?\s*(?:(?:Resposta|Orienta[çc][aã]o|Ensinamento)\s+de\s+)?Meishu-[Ss]ama\s*\)?\s*:?\s*\*\*"
    r"|\*\*\s*\(\s*(?:Resposta|Orienta[çc][aã]o)\s*\)\s*\*\*"
    r"|(?:Resposta|Orienta[çc][aã]o)\s+de\s+Meishu-Sama(?!:)"
    r")",
    re.I,
)

# Orphan heuristic: standalone "Ensinamento de Meishu-Sama" line
A_ORPHAN_LINE = re.compile(r"^Ensinamento\s+de\s+Meishu-Sama\s*$", re.I)
# Inline suffix: `"quote" Ensinamento de Meishu-Sama`
A_INLINE_SUFFIX = re.compile(r'"\s+Ensinamento\s+de\s+Meishu-Sama\s*$', re.I)


def has_answer(content: str) -> bool:
    """Return True if the article has any detectable answer marker."""
    if A_STANDARD.search(content):
        return True
    for line in content.split("\n"):
        t = line.strip()
        # Skip the article header line (pos 0 equivalent: starts with Ensinamento…:)
        if re.match(r"Ensinamento\s+de\s+Meishu-Sama\s*:", t, re.I):
            continue
        if A_ORPHAN_LINE.match(t) or A_INLINE_SUFFIX.search(t):
            return True
    return False


def main():
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    files = sorted(glob.glob(os.path.join(data_dir, "*.json")))

    SKIP = {"guia_atendimento.json", "tab_overrides.json", "index.json"}

    orphans = []
    total_q = 0

    for fpath in files:
        base = os.path.basename(fpath)
        if base in SKIP or base.startswith("_audit"):
            continue
        try:
            raw = json.load(open(fpath, encoding="utf-8"))
        except Exception:
            continue

        items = raw if isinstance(raw, list) else raw.get("items", [])
        for item in items:
            if not isinstance(item, dict):
                continue
            content = (item.get("content_pt") or "").strip()
            if not content:
                continue

            if not Q_MARKER.search(content):
                continue

            total_q += 1

            if not has_answer(content):
                orphans.append(
                    {
                        "id": item.get("id"),
                        "title_pt": item.get("title_pt"),
                        "master_title": item.get("master_title") or item.get("Master_Title"),
                        "source_file": base,
                        "category": item.get("category_pt") or "",
                        "content_length": len(content),
                        "content_preview": content[:300],
                    }
                )

    out = {
        "description": (
            "Articles that have a Pergunta marker but no detectable answer marker. "
            "Regenerate with: python scripts/generate_orphan_audit.py"
        ),
        "detection_markers": {
            "question": [
                "Pergunta do Fiel/Ministrante",
                "Fala do fiel",
                "**(Pergunta)**",
                "**Interlocutor:**",
                "**Pergunta**",
            ],
            "answer": [
                "Resposta de Meishu-Sama",
                "Orientação de Meishu-Sama",
                "**Meishu-Sama:**",
                "**(Orientação)**",
                "**(Resposta)**",
                "**(Orientação de Meishu-sama)**",
                "Ensinamento de Meishu-Sama (standalone orphan line)",
            ],
        },
        "summary": {
            "total_q_articles": total_q,
            "orphans": len(orphans),
        },
        "orphans": orphans,
    }

    out_path = os.path.join(data_dir, "_audit_articles_pergunta_sem_resposta.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"Articles with Pergunta marker : {total_q}")
    print(f"Orphans (no answer detected)  : {len(orphans)}")
    print()
    print("By source file:")
    for fname, n in Counter(o["source_file"] for o in orphans).most_common():
        print(f"  {n:4d}  {fname}")
    print()
    print(f"Saved → {out_path}")


if __name__ == "__main__":
    main()
