"""Parse the JP MD source for vol 3 and fill title_jp/content_jp on the merged JSON.

Aligns by (section_num, article_num, sub_letter) hierarchical key, which both
the PT-side schema v2 and the JP MD encode (using kanji numerals).

JP MD irregularities handled:
- Section: `## 一、{title}` (kanji roman + 、)
- Article: `### １、{title}（{source}）` (full-width digit + 、)
- Article (irregular bold): `**8、{title}**（{source}）` or `**１　{title}**`
- Sub: `#### 1.（{source}） {content...}` (regular digit + .)
- Sub (alt spacing): `#### 　2.{stuff}` (full-width space)
- Source citation kanji digits: 二八号 = 28, 一一号 = 11, 二十七号 = 27, 十号 = 10
"""
from __future__ import annotations
import json
import re
from pathlib import Path

# ============================================================
# Number conversion utilities
# ============================================================

JP_DIGITS = {'〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
             '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
JP_ROMAN = {'一': 'I', '二': 'II', '三': 'III', '四': 'IV', '五': 'V',
            '六': 'VI', '七': 'VII', '八': 'VIII', '九': 'IX', '十': 'X'}
FW_DIGITS = str.maketrans('０１２３４５６７８９', '0123456789')


def kanji_to_int(s: str) -> int | None:
    """Convert kanji numerals to int. Handles both sequential (二八=28)
    and positional (二十七=27, 十=10, 十五=15) notations."""
    if not s:
        return None
    s = s.strip()
    if s == '十':
        return 10
    if s == '百':
        return 100
    if '十' in s:
        # Positional: e.g., 二十七 → 27, 十五 → 15, 二十 → 20
        parts = s.split('十', 1)
        tens_str, ones_str = parts[0], parts[1] if len(parts) > 1 else ''
        tens = JP_DIGITS.get(tens_str, 1) if tens_str else 1
        ones = JP_DIGITS.get(ones_str, 0) if ones_str else 0
        return tens * 10 + ones
    # Sequential: e.g., 二八 → 28, 一一 → 11
    out = ''
    for c in s:
        if c in JP_DIGITS:
            out += str(JP_DIGITS[c])
        elif c.isdigit():
            out += c
    return int(out) if out else None


def fw_to_int(s: str) -> int | None:
    """Convert full-width (or mixed) digits to int: '１' → 1, '２０' → 20."""
    if not s:
        return None
    converted = s.translate(FW_DIGITS).strip()
    return int(converted) if converted.isdigit() else None


# ============================================================
# Source parser
# ============================================================

# Source forms encountered in JP MD:
#   御教え集二八号　五頁
#   御教え集一一号　五頁
#   御教え集十号　三十頁
#   御垂示録二五号　一二頁
#   地上天国四八号　一一頁
#   御教え          (just "Mioshie" — generic ensinamento, no issue/page)
#   御教え集四号　二四号  (typo in source: should be 二四頁)
SOURCE_RE = re.compile(
    r'^(?P<name>御教え集|御垂示録|地上天国|御教え|御水示録|信仰雑話|栄光)'
    r'(?:(?P<issue>[０-９0-9一二三四五六七八九十〇]+)号)?'
    r'(?:[\s　]*(?P<page>[０-９0-9一二三四五六七八九十〇]+)[頁号])?$'
)
SOURCE_NAME_TO_PT = {
    '御教え集': 'Mioshie-shū',
    '御垂示録': 'Gosui-ji Roku',
    '地上天国': 'Chijō Tengoku',
    '御教え': 'Mioshie',
    '信仰雑話': 'Shinkō Zatsuwa',
    '栄光': 'Eikō',
}


def parse_jp_source(text: str) -> dict | None:
    """'御教え集二八号　五頁' → {'name': 'Mioshie-shū', 'issue': 28, 'page': 5}."""
    if not text:
        return None
    text = text.strip().strip('（）()').strip()
    m = SOURCE_RE.match(text)
    if not m:
        return None
    name_jp = m.group('name')
    name_pt = SOURCE_NAME_TO_PT.get(name_jp, name_jp)
    issue_raw = m.group('issue')
    page_raw = m.group('page')
    # Try kanji first, fallback to fw/ascii
    issue = kanji_to_int(issue_raw) if issue_raw else None
    if issue is None and issue_raw:
        issue = fw_to_int(issue_raw)
    page = kanji_to_int(page_raw) if page_raw else None
    if page is None and page_raw:
        page = fw_to_int(page_raw)
    return {'name': name_pt, 'issue': issue, 'page': page}


# ============================================================
# JP MD parser
# ============================================================

# `## 一、神霊医学教育の目的`
SECTION_HEAD_RE = re.compile(r'^##\s+(?P<roman>[一二三四五六七八九十]+)、(?P<title>.+?)\s*$')

# `### １、本教発展の仕組と信徒の使命` (optionally with `（source）` and/or trailing inline content)
# IV.1 in vol 3 has heading + source + content all on the same line.
ARTICLE_HEAD_RE = re.compile(
    r'^###\s+(?P<num>[０-９]+)、'
    r'(?P<title>[^（）]+?)'
    r'(?:[\s　]*（(?P<source>[^（）]+?)）)?'
    r'(?:[\s　]+(?P<inline>.+))?'
    r'\s*$'
)

# Bold-formatted articles: `**8、…**（御教え）` or `**11、…**（御教え集四号　二四号）`
BOLD_ARTICLE_RE = re.compile(
    r'^\*\*(?P<num>[０-９0-9]+)[、\s　]+(?P<title>[^*]+?)\*\*'
    r'(?:（(?P<source>[^（）]+?)）)?'
    r'(?:[\s　]+(?P<inline>.+))?'
    r'\s*$'
)

# Subitem heading: `#### 1.（御教え集二八号　五頁） 私は前から…`
# Or:              `#### 　2.（御教え集一七号　五九頁） これからは…`  (full-width space + dot)
# Or (no source):  `#### 1.力を抜くこと（御教え集二号　七一頁）` (II.1 style)
# Strategy: capture leading num + . + rest, then try to extract source from rest
SUB_HEAD_RE = re.compile(r'^####[\s　]*(?P<num>[0-9]+)\.(?P<rest>.*)$')


def parse_jp_md(md_path: Path) -> dict:
    """Returns dict: (section_num, article_num, sub_letter) → {title_jp, content_jp, source_ref}.
    Also stores section intro under (section_num, None, None) when present."""
    lines = md_path.read_text(encoding='utf-8').splitlines()

    items: dict = {}
    state = {
        'section_num': None,    # 'I'/'II'/'III'/'IV'
        'section_title': None,  # JP title (e.g. "神霊医学教育の目的")
        'article_num': None,    # int
        'article_title': None,  # JP article title
        'article_source': None, # parsed source from heading
        'sub_letter': None,     # 'a'/'b'/...
        'sub_source': None,     # parsed source of subitem
        'buf': [],              # accumulating content lines
    }

    def flush():
        if state['section_num'] is None:
            return
        # Decide what we're flushing
        content = '\n'.join(state['buf']).strip()
        # Strip multiple blank lines
        content = re.sub(r'\n{3,}', '\n\n', content)

        if state['sub_letter']:
            key = (state['section_num'], state['article_num'], state['sub_letter'])
            items[key] = {
                'title_jp': state['article_title'] or '',
                'content_jp': content,
                'source_ref_jp': state['sub_source'],
            }
        elif state['article_num'] is not None:
            key = (state['section_num'], state['article_num'], None)
            # Only emit if we have real content or this is a parent-with-subs (empty content OK then)
            items[key] = {
                'title_jp': state['article_title'] or '',
                'content_jp': content,
                'source_ref_jp': state['article_source'],
            }
        elif content:
            # Section intro
            key = (state['section_num'], None, None)
            items[key] = {
                'title_jp': state['section_title'] or '',
                'content_jp': content,
                'source_ref_jp': None,
            }
        state['buf'] = []

    def start_article(num_int: int, title: str, source_text: str | None, inline_content: str | None = None):
        flush()
        # Reset sub state when starting a new article
        state['sub_letter'] = None
        state['sub_source'] = None
        state['article_num'] = num_int
        state['article_title'] = title.strip()
        state['article_source'] = parse_jp_source(source_text) if source_text else None
        # If the heading line carries inline content (rare — IV.1 case in vol 3), seed buf with it
        state['buf'] = [inline_content.strip()] if inline_content and inline_content.strip() else []

    for raw in lines:
        line = raw.rstrip()
        stripped = line.strip()

        # Skip volume heading `# 浄霊法講座（三）`
        if line.startswith('# ') and not line.startswith('## '):
            continue

        # Section?
        m = SECTION_HEAD_RE.match(line)
        if m:
            flush()
            roman = m.group('roman')
            state['section_num'] = JP_ROMAN.get(roman[0])
            state['section_title'] = m.group('title').strip()
            state['article_num'] = None
            state['article_title'] = None
            state['article_source'] = None
            state['sub_letter'] = None
            state['sub_source'] = None
            state['buf'] = []
            continue

        # Article (### or **bold**)
        m_art = ARTICLE_HEAD_RE.match(line)
        if m_art:
            num = fw_to_int(m_art.group('num'))
            if num is not None:
                start_article(num, m_art.group('title'), m_art.group('source'), m_art.group('inline'))
                continue

        m_bold = BOLD_ARTICLE_RE.match(line)
        if m_bold:
            # Bold articles can use either full-width or regular digits
            num_str = m_bold.group('num')
            num = fw_to_int(num_str)
            if num is None:
                num = int(num_str) if num_str.isdigit() else None
            if num is not None:
                start_article(num, m_bold.group('title'), m_bold.group('source'), m_bold.group('inline'))
                continue

        # Sub (####)
        m_sub = SUB_HEAD_RE.match(line)
        if m_sub:
            flush()
            sub_num = int(m_sub.group('num'))
            sub_letter = chr(ord('a') + sub_num - 1)
            rest = m_sub.group('rest').strip()
            # Try to extract source from `（...）` at the start of rest
            source_text = None
            content_inline = rest
            sm = re.match(r'^（(.+?)）\s*(.*)$', rest)
            if sm:
                # If the parenthetical looks like a source citation, treat as source
                candidate = sm.group(1)
                if parse_jp_source(candidate) is not None:
                    source_text = candidate
                    content_inline = sm.group(2)
                # else: keep as inline content (e.g., II.1 sub with title `力を抜くこと（御教え集二号　七一頁）`)
            else:
                # Try suffix form: `力を抜くこと（御教え集二号　七一頁）`
                sm2 = re.match(r'^(.+?)（(.+?)）\s*$', rest)
                if sm2:
                    candidate = sm2.group(2)
                    if parse_jp_source(candidate) is not None:
                        source_text = candidate
                        content_inline = ''  # The "title" is just `力を抜くこと` — treat as no inline content
            state['sub_letter'] = sub_letter
            state['sub_source'] = parse_jp_source(source_text) if source_text else None
            state['buf'] = [content_inline] if content_inline else []
            continue

        # Otherwise: content line
        if state['section_num'] is not None:
            state['buf'].append(line)

    flush()
    return items


# ============================================================
# Merger
# ============================================================

def main():
    md = Path('Markdown/MD_Original/浄霊法講座3.md')
    json_path = Path('data/johrei_vol03_bilingual.json')

    jp_items = parse_jp_md(md)
    print(f'Parsed {len(jp_items)} JP entries from {md}')
    for key in sorted(jp_items.keys(), key=lambda k: (
        ['I','II','III','IV','V'].index(k[0]) if k[0] else 99,
        k[1] if k[1] is not None else 0,
        k[2] or '',
    )):
        info = jp_items[key]
        src = info.get('source_ref_jp')
        src_str = f"{src['name']} #{src['issue']}p{src['page']}" if src and src.get('issue') else (src['name'] if src else '-')
        clen = len(info['content_jp'])
        print(f"  §{key[0]}.{key[1] if key[1] is not None else '-'}{('.'+key[2]) if key[2] else ''}  "
              f"src={src_str:25}  clen={clen:5}  {info['title_jp'][:50]}")

    data = json.loads(json_path.read_text(encoding='utf-8'))
    matched = 0
    unmatched = []
    for entry in data:
        key = (entry.get('section_num'), entry.get('article_num'), entry.get('sub_letter'))
        if key in jp_items:
            jp = jp_items[key]
            entry['title_jp'] = jp['title_jp']
            entry['content_jp'] = jp['content_jp']
            matched += 1
        else:
            unmatched.append(entry['id'])

    print()
    print(f'Matched {matched}/{len(data)} entries with JP source')
    if unmatched:
        print(f'Unmatched IDs ({len(unmatched)}):')
        for uid in unmatched:
            e = next(x for x in data if x['id'] == uid)
            print(f'  - {uid}  §{e.get("section_num")}.{e.get("article_num")}{("." + e.get("sub_letter")) if e.get("sub_letter") else ""}  {e.get("title_pt","")[:50]}')

    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote → {json_path}')


if __name__ == '__main__':
    main()
