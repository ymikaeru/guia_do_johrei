"""Apply MD_PT_v5_calibrated/Aba Fundamentos.md to data/tab_fundamentos.json.

- Substitui `conteudo` dos 12 artigos pelo texto re-traduzido sob §1.4.
- Preserva `id`, `titulo`, `fonte` (e não inclui a parentética no conteudo se o
  campo `fonte` já estiver populado, para evitar duplicação).
- Para artigos com `fonte: null`, mantém a parentética inline no início do
  primeiro parágrafo (estrutura legada).
- Faz backup em `data/tab_fundamentos.json.bak.before_v5_<timestamp>`.
"""

import json
import re
import shutil
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "tab_fundamentos.json"
MD_PATH = ROOT / "Markdown" / "MD_PT_v5_calibrated" / "Aba Fundamentos.md"


def parse_md(md_text: str) -> list[dict]:
    """Return list of {n, title, parenthetical|None, body} per article."""
    # Split on lines that start with `## N\.` (backslash-period in raw MD)
    parts = re.split(r"\n## (\d+)\\\. ", md_text)
    # parts: [preamble, n1, art1_text, n2, art2_text, ...]
    results = []
    for i in range(1, len(parts), 2):
        n = int(parts[i])
        chunk = parts[i + 1]
        # chunk = "Title\n\n*(parenthetical)*\n\n para1\n\npara2..."
        lines = chunk.split("\n")
        title = lines[0].strip()
        idx = 1
        # skip empties
        while idx < len(lines) and lines[idx].strip() == "":
            idx += 1
        # Detecta linha de fonte parentética curta: *(...)*
        # NÃO captura *texto longo de lead-in* (art 7) — só `*(...)*` estrito.
        parenthetical = None
        if idx < len(lines):
            m = re.match(r"^\*\((.+)\)\*$", lines[idx].strip())
            if m:
                parenthetical = m.group(1).strip()  # conteúdo SEM parênteses externos
                idx += 1
                while idx < len(lines) and lines[idx].strip() == "":
                    idx += 1
        body = "\n".join(lines[idx:])
        # strip trailing footer line and trailing dashes
        body = re.sub(r"\n+---\s*\n+\*Aba Fundamentos completa.*?\*\s*$", "", body, flags=re.DOTALL)
        body = body.rstrip()
        # collapse `### ＝ N ＝` -> `＝ N ＝` (preserve as inline section marker)
        body = re.sub(r"^### ", "", body, flags=re.MULTILINE)
        results.append({"n": n, "title": title, "parenthetical": parenthetical, "body": body})
    return results


def main():
    with open(MD_PATH, encoding="utf-8") as f:
        md_text = f.read()
    with open(JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    articles_md = parse_md(md_text)
    if len(articles_md) != 12:
        raise SystemExit(f"Esperado 12 artigos, achei {len(articles_md)}")

    arts_json = data["sub_abas"][0]["categorias"][0]["artigos"]
    if len(arts_json) != 12:
        raise SystemExit(f"JSON tem {len(arts_json)} artigos, esperado 12")

    for art_md, art_json in zip(articles_md, arts_json):
        body = art_md["body"]
        par = art_md["parenthetical"]
        has_fonte = bool(art_json.get("fonte"))

        if par and not has_fonte:
            # Inject parentética inline no início do primeiro parágrafo
            lines = body.split("\n")
            for i, ln in enumerate(lines):
                if ln.strip():
                    lines[i] = f"({par}) " + ln
                    break
            body = "\n".join(lines)
        # se par existe e fonte já está populado: descarta par (já está em `fonte`)

        # Caso especial: a v5 MD pode ter uma linha em itálico não-parentética
        # no início (ex.: art 5 "*Hikari Shimbun ...*"). Se o campo `fonte` já
        # tem essa info, dropar a linha pra evitar duplicação.
        if has_fonte:
            body_lines = body.split("\n")
            j = 0
            while j < len(body_lines) and body_lines[j].strip() == "":
                j += 1
            if j < len(body_lines):
                m_italic = re.match(r"^\*([^*]+)\*$", body_lines[j].strip())
                if m_italic:
                    # drop esta linha + linhas em branco subsequentes
                    j += 1
                    while j < len(body_lines) and body_lines[j].strip() == "":
                        j += 1
                    body = "\n".join(body_lines[j:])

        # Formato legado: leading newline
        new_conteudo = "\n" + body
        art_json["conteudo"] = new_conteudo
        print(f"OK fundamentos_{art_md['n']:03d}: {art_md['title'][:60]}")

    # Backup
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = JSON_PATH.with_suffix(f".json.bak.before_v5_{ts}")
    shutil.copy(JSON_PATH, backup)
    print(f"\nBackup: {backup.name}")

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Atualizado: {JSON_PATH.name}")


if __name__ == "__main__":
    main()
