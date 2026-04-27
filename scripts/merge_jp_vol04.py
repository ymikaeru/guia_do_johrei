"""Parse the JP MD source for vol 4 and fill title_jp/content_jp on the merged JSON.

Vol 4 differs from vol 3:
- Sections use `# **kanji-roman、{title}**` (level 1 + bold) instead of vol 3's `## roman、`
- Articles are bold-only `**fw-digit、{title}**（source）` (no `###` heading)
- Sub-articles use inline `①②③` symbols instead of `#### 1.`/`(a)`
- Two chapters detected by ROMAN REGRESSION: when section roman drops below
  the previous max within a chapter, we know a new chapter started.

Aligns by (chapter_num, section_num, article_num, sub_letter) hierarchical key.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

JP_DIGITS = {'〇': 0, '一': 1, '二': 2, '三': 3, '四': 4,
             '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
JP_ROMAN = {'一': 'I', '二': 'II', '三': 'III', '四': 'IV', '五': 'V',
            '六': 'VI', '七': 'VII', '八': 'VIII', '九': 'IX', '十': 'X'}
ROMAN_INT = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7,
             'VIII': 8, 'IX': 9, 'X': 10}
FW_DIGITS = str.maketrans('０１２３４５６７８９', '0123456789')

# ①②③④⑤⑥⑦⑧⑨⑩ → 1..10 → 'a'..'j'
CIRCLED_DIGITS = '①②③④⑤⑥⑦⑧⑨⑩'


def kanji_to_int(s: str) -> int | None:
    if not s:
        return None
    s = s.strip()
    if s == '十':
        return 10
    if '十' in s:
        parts = s.split('十', 1)
        tens_str, ones_str = parts[0], parts[1] if len(parts) > 1 else ''
        tens = JP_DIGITS.get(tens_str, 1) if tens_str else 1
        ones = JP_DIGITS.get(ones_str, 0) if ones_str else 0
        return tens * 10 + ones
    out = ''
    for c in s:
        if c in JP_DIGITS:
            out += str(JP_DIGITS[c])
        elif c.isdigit():
            out += c
    return int(out) if out else None


def fw_to_int(s: str) -> int | None:
    if not s:
        return None
    converted = s.translate(FW_DIGITS).strip()
    return int(converted) if converted.isdigit() else None


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
    if not text:
        return None
    text = text.strip().strip('（）()').strip()
    m = SOURCE_RE.match(text)
    if not m:
        return None
    name_pt = SOURCE_NAME_TO_PT.get(m.group('name'), m.group('name'))
    issue_raw = m.group('issue')
    page_raw = m.group('page')
    issue = kanji_to_int(issue_raw) if issue_raw else None
    if issue is None and issue_raw:
        issue = fw_to_int(issue_raw)
    page = kanji_to_int(page_raw) if page_raw else None
    if page is None and page_raw:
        page = fw_to_int(page_raw)
    return {'name': name_pt, 'issue': issue, 'page': page}


# `# **一、現代医学には科学性がない**`
SECTION_HEAD_RE = re.compile(r'^#\s+\*\*(?P<roman>[一二三四五六七八九十]+)、(?P<title>.+?)\*\*\s*$')

# `**１、{title}**（{source}）` or `**１、{title}**`
BOLD_ARTICLE_RE = re.compile(
    r'^\*\*(?P<num>[０-９0-9]+)、(?P<title>[^*]+?)\*\*'
    r'(?:（(?P<source>[^（）]+?)）)?'
    r'(?:[\s　]+(?P<inline>.+))?'
    r'\s*$'
)

# Inline subitem: `①{title}（{source}）` followed by content
SUBITEM_INLINE_RE = re.compile(
    r'^(?P<sym>[①②③④⑤⑥⑦⑧⑨⑩])(?P<rest>.+)$'
)


def split_subitem_line(rest: str) -> tuple[str, dict | None, str]:
    """Given the part after ①, returns (title, source, leftover_content).
    If there's a `（...）` source, extract it; everything before is title."""
    # Try suffix source: text + （source）
    m = re.search(r'^(.+?)（(.+?)）\s*$', rest)
    if m:
        candidate = m.group(2)
        if parse_jp_source(candidate) is not None:
            return m.group(1).strip(), parse_jp_source(candidate), ''
    # Try inline source after first sentence
    m = re.match(r'^(.+?)（(.+?)）(.*)$', rest)
    if m:
        candidate = m.group(2)
        if parse_jp_source(candidate) is not None:
            return m.group(1).strip(), parse_jp_source(candidate), m.group(3).strip()
    # No source found
    return rest.strip(), None, ''


def parse_jp_md(md_path: Path) -> dict:
    """Returns dict: (chapter_num, section_num, article_num, sub_letter) → {title_jp, content_jp, source_ref}."""
    lines = md_path.read_text(encoding='utf-8').splitlines()

    items: dict = {}
    state = {
        'chapter_num': None,
        'section_num': None,
        'section_title_jp': None,      # JP title of current section (used as fallback article_title for section-as-article)
        'section_int_in_chapter': 0,
        'chapter_int': 0,
        'article_num': None,
        'article_title': None,
        'article_source': None,
        'sub_letter': None,
        'sub_source': None,
        'buf': [],
        'section_pending_article': False,  # set after section heading; used to detect section-as-article
    }

    def flush():
        if state['chapter_num'] is None or state['section_num'] is None:
            return
        content = '\n'.join(state['buf']).strip()
        content = re.sub(r'\n{3,}', '\n\n', content)
        if state['sub_letter']:
            key = (state['chapter_num'], state['section_num'], state['article_num'], state['sub_letter'])
            items[key] = {
                'title_jp': state['article_title'] or '',
                'content_jp': content,
                'source_ref_jp': state['sub_source'],
            }
        elif state['article_num'] is not None:
            key = (state['chapter_num'], state['section_num'], state['article_num'], None)
            items[key] = {
                'title_jp': state['article_title'] or '',
                'content_jp': content,
                'source_ref_jp': state['article_source'],
            }
        state['buf'] = []

    def start_article(num_int: int, title: str, source_text: str | None, inline: str | None = None):
        flush()
        state['sub_letter'] = None
        state['sub_source'] = None
        state['article_num'] = num_int
        state['article_title'] = title.strip()
        state['article_source'] = parse_jp_source(source_text) if source_text else None
        state['buf'] = [inline.strip()] if inline and inline.strip() else []

    def start_subitem(sym: str, rest: str):
        flush()
        idx = CIRCLED_DIGITS.index(sym)  # 0-based
        sub_letter = chr(ord('a') + idx)
        title, source, leftover = split_subitem_line(rest)
        state['sub_letter'] = sub_letter
        state['sub_source'] = source
        # Sub-article reuses parent article title in JP (the ①②③ teaching is part of same article)
        # But its own brief title is in `title`. We store the brief sub-title in article_title for sub.
        # Actually for consistency with vol 3 (where subs share article_title), keep article_title from parent.
        # The brief title acts as an in-content lead.
        state['buf'] = [leftover] if leftover else []
        if title:
            # Prepend the brief sub-title as first line of content (so the JP card shows both)
            state['buf'].insert(0, title)

    for raw in lines:
        line = raw.rstrip()

        # Skip volume heading `# 浄霊法講座（四）`
        if line.startswith('# ') and not line.startswith('# **'):
            continue

        # Section heading
        m = SECTION_HEAD_RE.match(line)
        if m:
            flush()
            roman = m.group('roman')
            new_section_int = ROMAN_INT.get(JP_ROMAN.get(roman[0], ''), 0)

            # Detect chapter boundary by section roman regression
            if new_section_int <= state['section_int_in_chapter'] and state['chapter_int'] >= 1:
                # Roman dropped (or repeated) → new chapter
                state['chapter_int'] += 1
                state['chapter_num'] = ROMAN_LIST[state['chapter_int'] - 1]
            elif state['chapter_int'] == 0:
                state['chapter_int'] = 1
                state['chapter_num'] = 'I'

            state['section_num'] = JP_ROMAN.get(roman[0], 'I')
            state['section_title_jp'] = m.group('title').strip()
            state['section_int_in_chapter'] = new_section_int
            state['article_num'] = None
            state['article_title'] = None
            state['article_source'] = None
            state['sub_letter'] = None
            state['sub_source'] = None
            state['buf'] = []
            state['section_pending_article'] = True  # might be section-as-article (no `**N、` follows)
            continue

        # Article heading (bold)
        m = BOLD_ARTICLE_RE.match(line)
        if m:
            num = fw_to_int(m.group('num'))
            if num is None:
                num_str = m.group('num')
                num = int(num_str) if num_str.isdigit() else None
            if num is not None:
                state['section_pending_article'] = False  # explicit article supersedes section-as-article
                start_article(num, m.group('title'), m.group('source'), m.group('inline'))
                continue

        # Subitem inline (①②③)
        m = SUBITEM_INLINE_RE.match(line)
        if m and state['article_num'] is not None:
            start_subitem(m.group('sym'), m.group('rest'))
            continue

        # Section-as-article: if the section heading was just seen and this line
        # is a paren-only source citation, peel it as the source and start article 1.
        stripped = line.strip()
        if state.get('section_pending_article') and stripped:
            # Try paren-only source line: `（御教え集二六号　四九頁）` (with optional trailing soft-break spaces)
            sm = re.match(r'^（(.+?)）\s*$', stripped)
            if sm and parse_jp_source(sm.group(1)) is not None:
                start_article(1, state['section_title_jp'] or '',
                              sm.group(1), None)
                state['section_pending_article'] = False
                continue
            # Otherwise: any non-empty content begins auto-article 1 (no source on heading)
            start_article(1, state['section_title_jp'] or '', None, line)
            state['section_pending_article'] = False
            continue

        # Content line
        if state['section_num'] is not None:
            state['buf'].append(line)

    flush()
    return items


ROMAN_LIST = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']


def main():
    md = Path('Markdown/MD_Original/浄霊法講座4.md')
    json_path = Path('data/johrei_vol04_bilingual.json')

    jp_items = parse_jp_md(md)
    print(f'Parsed {len(jp_items)} JP entries from {md}')
    for key in sorted(jp_items.keys(), key=lambda k: (
        ROMAN_INT.get(k[0], 99),
        ROMAN_INT.get(k[1], 99),
        k[2] if k[2] is not None else 0,
        k[3] or '',
    )):
        info = jp_items[key]
        src = info.get('source_ref_jp')
        src_str = f"{src['name']} #{src['issue']}p{src['page']}" if src and src.get('issue') else (src['name'] if src else '-')
        clen = len(info['content_jp'])
        sub = ('.' + key[3]) if key[3] else ''
        print(f"  ch={key[0]} §{key[1]}.{key[2]}{sub:6}  src={src_str:25}  clen={clen:5}  {info['title_jp'][:50]}")

    data = json.loads(json_path.read_text(encoding='utf-8'))
    matched = 0
    unmatched = []
    for entry in data:
        key = (entry.get('chapter_num'), entry.get('section_num'),
               entry.get('article_num'), entry.get('sub_letter'))
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
            print(f'  - {uid}  ch={e.get("chapter_num")} §{e.get("section_num")}.{e.get("article_num")}{("." + e.get("sub_letter")) if e.get("sub_letter") else ""}  {e.get("title_pt","")[:50]}')

    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote → {json_path}')


if __name__ == '__main__':
    main()
