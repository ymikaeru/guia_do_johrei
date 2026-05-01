#!/usr/bin/env python3
"""Parse Markdown MD_PT_v4 files into structured tab JSON.

Schema output per file:
{
  "id": "fundamentos",
  "aba": "Fundamentos",
  "hero": null,
  "sub_abas": [
    {
      "id": "default",
      "titulo": null,
      "hero": null,
      "categorias": [
        {
          "titulo": null,
          "artigos": [
            {
              "id": "fundamentos_001",
              "titulo": "O que é a Doença",
              "fonte": "Mioshie-shū n.º 23, pág. 47",
              "conteudo": "..."
            }
          ]
        }
      ]
    }
  ]
}
"""
import re
import json
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
MD_DIR   = BASE_DIR / "Markdown" / "MD_PT_v4"
OUT_DIR  = BASE_DIR / "data"

# (filename, tab_id, display_name)
MD_FILES = [
    ("Aba Fundamentos.md",                  "fundamentos",            "Fundamentos"),
    ("Aba Pratica.md",                      "pratica",                "Prática"),
    ("Aba Crítica Farmacologica.md",        "critica_farmacologica",  "Crítica Farmacológica"),
    ("Aba Orientações por Purificação.md",  "por_regiao",             "Por Região"),
]

def clean_md(text):
    """Remove markdown escapes (\\. \\[ \\] \\) \\# \\*) and strip."""
    # Remove backslash before: . [ ] # ) *
    text = text.replace('\\.', '.')
    text = text.replace('\\[', '[')
    text = text.replace('\\]', ']')
    text = text.replace('\\#', '#')
    text = text.replace('\\)', ')')
    text = text.replace('\\*', '*')
    return text.strip()

def slugify(text):
    trans = str.maketrans(
        'ãâáàäêéèëíìîïõôóòöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
    )
    text = text.lower().translate(trans)
    return re.sub(r'[^a-z0-9]+', '_', text).strip('_')

def parse_md(filepath, tab_id, tab_name):
    with open(filepath, encoding='utf-8') as f:
        lines = f.readlines()

    tab = {"id": tab_id, "aba": tab_name, "hero": None, "sub_abas": []}

    current_sub = None
    current_cat = None
    current_art = None
    buf          = []
    art_counter  = 0
    hero_target  = tab
    # Track whether current category was created via [Titulo Categoria]
    # so we know that ### items should be articles, not sub-points
    in_titulo_cat = False

    def ensure_default_sub():
        nonlocal current_sub, current_cat
        if not tab["sub_abas"]:
            current_sub = {"id": "default", "titulo": None, "hero": None, "categorias": []}
            tab["sub_abas"].append(current_sub)
            # Do NOT auto-create a category here — let the caller decide
        if current_sub and not current_sub["categorias"]:
            current_cat = {"titulo": None, "artigos": []}
            current_sub["categorias"].append(current_cat)

    def ensure_cat():
        nonlocal current_cat
        ensure_default_sub()
        if current_cat is None:
            current_cat = {"titulo": None, "artigos": []}
            current_sub["categorias"].append(current_cat)

    def flush_art():
        nonlocal current_art, buf
        if current_art is not None:
            current_art["conteudo"] = "\n".join(buf).rstrip()
        current_art = None
        buf = []

    def start_article(raw_titulo, next_line_idx):
        nonlocal art_counter, current_art, buf
        art_counter += 1
        titulo = re.sub(r'^[\d]+[\\.]?\s*', '', clean_md(raw_titulo)).strip()

        # Look ahead for fonte: first italic line *...*
        # Only skip blank lines, stop at first non-blank
        fonte = None
        j = next_line_idx
        while j < len(lines) and not lines[j].strip():
            j += 1
        if j < len(lines):
            fm = re.match(r'^\*([^*]+)\*\s*$', lines[j].strip())
            if fm:
                fonte = clean_md(fm.group(1).strip())
                # Return j so the caller does i = j, then i += 1 → j+1
                ret_i = j
            else:
                # No fonte found; return next_line_idx - 1 so caller's i += 1 → next_line_idx
                ret_i = next_line_idx - 1
        else:
            ret_i = next_line_idx - 1

        art_id = f"{tab_id}_{art_counter:03d}"
        current_art = {"id": art_id, "titulo": titulo, "fonte": fonte, "conteudo": ""}
        buf = []
        current_cat["artigos"].append(current_art)
        return ret_i

    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n')

        # [Aba] header — skip
        if re.match(r'^#+\s*\\\[Aba\\\]', line):
            i += 1
            continue

        # [Hero] — can appear at tab level or after a sub-aba header
        m = re.match(r'^\s*\\\[Hero\\\]\s*(.*)', line)
        if m:
            flush_art()
            hero_txt = clean_md(m.group(1)).lstrip(']').strip()
            i += 1
            while i < len(lines):
                nxt = lines[i].rstrip('\n')
                if re.match(r'^#', nxt) or re.match(r'^\s*\\\[', nxt):
                    break
                if nxt.strip():
                    hero_txt += '\n' + nxt.strip()
                i += 1
            hero_target["hero"] = hero_txt or None
            continue

        # [Sub-aba] — at any heading level (#, ##, ###)
        m = re.match(r'^#+\s*\\\[Sub-aba\\\]\s*(.*)', line, re.IGNORECASE)
        if m:
            flush_art()
            titulo = clean_md(m.group(1))
            current_sub = {"id": slugify(titulo), "titulo": titulo, "hero": None, "categorias": []}
            tab["sub_abas"].append(current_sub)
            current_cat = None
            in_titulo_cat = False
            hero_target = current_sub
            i += 1
            continue

        # [Titulo Categoria] explicit — at any heading level
        m = re.match(r'^#+\s*\\\[Titulo Categoria\\\]\s*(.*)', line, re.IGNORECASE)
        if m:
            flush_art()
            titulo = clean_md(m.group(1))
            # Ensure we have a sub-aba
            if not tab["sub_abas"]:
                current_sub = {"id": "default", "titulo": None, "hero": None, "categorias": []}
                tab["sub_abas"].append(current_sub)
            current_cat = {"titulo": titulo or None, "artigos": []}
            current_sub["categorias"].append(current_cat)
            in_titulo_cat = True
            i += 1
            continue

        # Bare # heading (not a special marker) → implicit Titulo Categoria
        m = re.match(r'^#(?!#)\s+(.*)', line)
        if m:
            raw = m.group(1)
            if re.search(r'\\\[', raw):
                i += 1
                continue
            flush_art()
            titulo = clean_md(raw)
            if not titulo:  # skip empty headings like "# "
                i += 1
                continue
            # Ensure we have a sub-aba
            if not tab["sub_abas"]:
                current_sub = {"id": "default", "titulo": None, "hero": None, "categorias": []}
                tab["sub_abas"].append(current_sub)
            current_cat = {"titulo": titulo, "artigos": []}
            current_sub["categorias"].append(current_cat)
            in_titulo_cat = False
            i += 1
            continue

        # ## Article (or sub-aba if it contains [Sub-aba], handled above)
        m = re.match(r'^##(?!#)\s+(.*)', line)
        if m:
            raw = m.group(1)
            # If it contains [Sub-aba] marker, handled above — shouldn't reach here
            # but guard anyway
            if re.search(r'\\\[Sub-aba\\\]', raw, re.IGNORECASE):
                i += 1
                continue
            flush_art()
            ensure_cat()
            in_titulo_cat = False
            i = start_article(raw, i + 1)
            i += 1
            continue

        # ### items
        m = re.match(r'^###\s+(.*)', line)
        if m:
            raw = m.group(1)
            if in_titulo_cat:
                # After a [Titulo Categoria], ### items are articles, not sub-points
                flush_art()
                ensure_cat()
                i = start_article(raw, i + 1)
                i += 1
            elif current_art is None:
                # Orphaned ### without an open article — treat as article anyway
                ensure_cat()
                i = start_article(raw, i + 1)
                i += 1
            else:
                # Sub-point within current article
                buf.append("### " + clean_md(raw))
                i += 1
            continue

        # Regular content
        if current_art is not None:
            buf.append(line)
        i += 1

    flush_art()

    # Post-process: remove articles with empty titulo
    for sub in tab["sub_abas"]:
        for cat in sub["categorias"]:
            cat["artigos"] = [a for a in cat["artigos"] if a["titulo"]]

    # Post-process: remove empty categories (no artigos)
    for sub in tab["sub_abas"]:
        sub["categorias"] = [c for c in sub["categorias"] if c["artigos"]]

    return tab


def main():
    for md_name, tab_id, tab_name in MD_FILES:
        filepath = MD_DIR / md_name
        print(f"Parsing {md_name} ...")
        tab = parse_md(filepath, tab_id, tab_name)

        total_arts = sum(
            len(c["artigos"])
            for s in tab["sub_abas"]
            for c in s["categorias"]
        )
        sub_names = [s["titulo"] or "(default)" for s in tab["sub_abas"]]
        print(f"  sub-abas: {sub_names}")
        print(f"  total artigos: {total_arts}")

        out = OUT_DIR / f"tab_{tab_id}.json"
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(tab, f, ensure_ascii=False, indent=2)
        print(f"  → {out}\n")


if __name__ == "__main__":
    main()
