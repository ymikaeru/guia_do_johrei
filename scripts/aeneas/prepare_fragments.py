#!/usr/bin/env python3
"""
Quebra o markdown do culto mensal em fragments.txt no formato que o aeneas
espera (uma linha = um fragmento, que vira um timestamp).

A divisão tem que espelhar EXATAMENTE a do js/culto-mensal.js#parseMarkdown:
  - split por linhas em branco -> blocks
  - bodyBlocks = blocks[2:]  (pula título + salmo)

Saída: data/<slug>.fragments.txt

Uso:
  python prepare_fragments.py            # slug = culto_mensal_atual (default)
  python prepare_fragments.py culto_especial_atual
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SLUG = sys.argv[1] if len(sys.argv) > 1 else "culto_mensal_atual"
SRC_MD = REPO / "data" / f"{SLUG}.md"
OUT_TXT = REPO / "data" / f"{SLUG}.fragments.txt"


def clean_for_tts(text: str) -> str:
    # Remove escapes de markdown (\. \, \! etc.) — viram literais ruins na TTS
    text = re.sub(r"\\([.,!?:;'\"()\[\]\\\-])", r"\1", text)
    # Remove marcadores de itálico *texto* (manter conteúdo)
    text = re.sub(r"\*([^*\n]+)\*", r"\1", text)
    # Achata espaços (newlines internos viram espaço)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main() -> int:
    if not SRC_MD.exists():
        print(f"ERRO: {SRC_MD} não encontrado", file=sys.stderr)
        return 1

    raw = SRC_MD.read_text(encoding="utf-8").lstrip("﻿").replace("\r\n", "\n")

    # Mesma lógica do parseMarkdown em JS
    blocks = [b.strip() for b in re.split(r"\n\s*\n", raw) if b.strip()]
    body_blocks = blocks[2:]  # pula título + salmo

    fragments = [clean_for_tts(b) for b in body_blocks]
    fragments = [f for f in fragments if f]  # descarta vazios

    OUT_TXT.write_text("\n".join(fragments) + "\n", encoding="utf-8")
    print(f"OK: {len(fragments)} fragmentos -> {OUT_TXT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
