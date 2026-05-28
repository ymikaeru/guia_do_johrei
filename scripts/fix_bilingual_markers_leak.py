"""
Fix bilingual marker leak in data/tab_pratica.json.

Three articles (pratica_001, pratica_005, pratica_012) have their `conteudo`
(PT field) polluted with leftover `#### PT` / `#### JP` markers from a
bilingual ingest. Under `#### JP` the text is a duplicate of the PT translation
(not Japanese), causing the user to see "PT", "JP" labels and the same
paragraph twice in the modal.

Action: in `conteudo` only,
  1. Remove every `#### PT\n` line (keep the PT text that follows).
  2. Remove every `#### JP\n` line AND the duplicate PT block that follows it,
     stopping at the next `### N.N` (source separator) or end of string.

`conteudo_jp` is left untouched — it isn't rendered anywhere in the app and
its own structure (with real JP under `#### JP`) may be consumed by tooling.
"""
import json, re, sys
from pathlib import Path

PATH = Path('data/tab_pratica.json')
TARGETS = {'pratica_001', 'pratica_005', 'pratica_012'}

# Matches `#### JP\n\n<duplicate PT text>` up to next `### N.N` source heading
# or end of string. Non-greedy on the body.
JP_BLOCK_RE = re.compile(
    r'####\s+JP\s*\n+'         # marker + blank line(s)
    r'.*?'                      # the duplicate PT body
    r'(?=\n###\s+\d+\.\d+|\Z)', # stop at next source heading or end
    re.DOTALL,
)
PT_MARKER_RE = re.compile(r'####\s+PT\s*\n+')


def clean_conteudo(text: str) -> str:
    text = JP_BLOCK_RE.sub('', text)
    text = PT_MARKER_RE.sub('', text)
    # Collapse 3+ consecutive blank lines down to 2 (one paragraph break)
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Strip trailing whitespace on the whole field
    return text.rstrip() + '\n' if text.endswith('\n') else text.rstrip()


def walk(node):
    if isinstance(node, dict):
        if node.get('id') in TARGETS:
            yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


def main():
    data = json.loads(PATH.read_text(encoding='utf-8'))
    changed = []
    for art in walk(data):
        before = art.get('conteudo', '')
        after = clean_conteudo(before)
        if before == after:
            print(f'[skip] {art["id"]} — no markers found')
            continue
        # Sanity: no residual marker
        if '#### PT' in after or '#### JP' in after:
            print(f'[ERROR] {art["id"]} still has markers after clean!', file=sys.stderr)
            sys.exit(1)
        # Confirm we didn't lose the initial paragraph
        if before[:80].strip() and before[:80].strip() not in after:
            print(f'[ERROR] {art["id"]} lost head paragraph!', file=sys.stderr)
            sys.exit(1)
        art['conteudo'] = after
        changed.append((art['id'], len(before), len(after)))
        print(f'[fix]  {art["id"]}: {len(before)} -> {len(after)} chars')

    if not changed:
        print('No changes.')
        return

    PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'\nWrote {PATH}. {len(changed)} articles updated.')


if __name__ == '__main__':
    main()
