#!/usr/bin/env python3
"""
build_related.py — pre-compute "Veja Também" recommendations.

Reads all data/*_bilingual.json, computes TF-IDF similarity over PT content
(title weighted 3x), combines with tag-IDF overlap and editorial signals
(Master_Title, source file, existing related_items), applies MMR for
diversity, writes data/related_v2.json.

Run from anywhere — paths resolve via this file's location.
Output: data/related_v2.json mapping id -> [{id, score, title}, ...].
"""
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path

SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[2]
DATA = ROOT / 'data'

# Stopwords PT-BR enxutas. Não incluir termos doutrinários (Deus, espírito,
# purificação, Johrei, Meishu-Sama) — IDF naturalmente os atenua.
PT_STOPWORDS = set('''
a o e é de da do das dos para com sem por que se em na no nas nos um uma uns
umas ao aos pela pelo pelas pelos como ou mas porque pois ja já também tambem
ainda muito mais menos sobre entre ate até onde quando quem qual quais este
esta estes estas esse essa esses essas isto isso aquilo aquela aquele aqueles
aquelas eu tu ele ela nos nós vos vós eles elas meu minha meus minhas seu sua
seus suas teu tua nosso nossa nossos nossas lhe lhes me te ser sou somos sao
são era eram foi fui foram seja sejam ter tem tinha tive tinham haver ha há
houve havia faz fazer feito feita feitas feitos fazem fica ficar dois duas
tres três quatro cinco seis sete oito nove dez nao não sim aqui ali la lá
aquí já tao tão pode podem poder posso podia podem deve deveria devem ja
mesmo mesma mesmos mesmas tudo todo toda todos todas algum alguma alguns
algumas nenhum nenhuma outro outra outros outras qualquer porém porem
porque então então tambem assim ate até deste desta destes destas neste
nesta nestes nestas isto disso desse dessa nisso nessa naquele naquela
'''.split())

TOKEN_RE = re.compile(r"[a-z0-9]+")


def strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def tokenize(text: str) -> list:
    text = strip_accents(text.lower())
    toks = TOKEN_RE.findall(text)
    return [t for t in toks if len(t) >= 3 and t not in PT_STOPWORDS]


def load_articles() -> list:
    arts = []
    for path in sorted(DATA.glob('*_bilingual.json')):
        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"  skip {path.name}: {e}")
            continue
        if not isinstance(data, list):
            continue
        for art in data:
            if not art.get('id'):
                continue
            content = art.get('content_pt') or art.get('content') or ''
            title = art.get('title_pt') or art.get('title') or ''
            if not (title and content):
                continue
            arts.append({
                'id': art['id'],
                'title': title,
                'content': content,
                'tags': art.get('tags') or [],
                'master_title': art.get('Master_Title') or '',
                'source_file': path.name,
                'related_items': art.get('related_items') or [],
            })
    return arts


def build_tfidf(articles: list) -> tuple:
    """Returns sparse normalized TF-IDF rows: list of dict[token, weight]."""
    N = len(articles)
    df = Counter()
    docs = []
    for art in articles:
        # Title repeated 3x to outweigh body length disparity
        text = (art['title'] + ' ') * 3 + art['content']
        toks = tokenize(text)
        tf = Counter(toks)
        docs.append(tf)
        for t in tf:
            df[t] += 1

    # Vocab filter: df ∈ [2, 0.85*N]. Upper bound generous because doctrinal
    # terms ("purificação", "Deus", "Johrei") are corpus-load-bearing.
    cap = int(0.85 * N)
    vocab_idf = {
        t: math.log((1 + N) / (1 + c)) + 1.0
        for t, c in df.items()
        if 2 <= c <= cap
    }

    rows = []
    for tf in docs:
        vec = {}
        for t, c in tf.items():
            idf = vocab_idf.get(t)
            if idf is not None:
                vec[t] = (1.0 + math.log(c)) * idf  # sublinear tf
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        rows.append({t: v / norm for t, v in vec.items()})
    return rows, vocab_idf


def cosine(a: dict, b: dict) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(t, 0.0) for t, v in a.items())


def build_tag_idf(articles: list) -> dict:
    N = len(articles)
    df = Counter()
    for a in articles:
        for t in set(a['tags']):
            df[t] += 1
    return {t: math.log((1 + N) / (1 + c)) + 1.0 for t, c in df.items()}


def tag_overlap_score(tags_a: set, tags_b: set, tag_idf: dict,
                      norm_a: float, norm_b: float) -> float:
    if not tags_a or not tags_b or norm_a == 0 or norm_b == 0:
        return 0.0
    shared = tags_a & tags_b
    if not shared:
        return 0.0
    score = sum(tag_idf.get(t, 0.0) for t in shared)
    return score / (norm_a * norm_b)


def main():
    print("Loading articles...")
    articles = load_articles()
    N = len(articles)
    print(f"  {N} articles")

    print(f"Building TF-IDF (title 3x, sublinear, df range [2, {int(0.85*N)}])...")
    rows, vocab_idf = build_tfidf(articles)
    print(f"  vocab size: {len(vocab_idf)}")

    print("Building tag IDF...")
    tag_idf = build_tag_idf(articles)
    print(f"  unique tags: {len(tag_idf)}")

    # Pre-compute auxiliary structures
    tags_set = [set(a['tags']) for a in articles]
    tag_norms = [
        math.sqrt(sum(tag_idf.get(t, 0.0) ** 2 for t in ts)) for ts in tags_set
    ]
    related_set = [set(a['related_items']) for a in articles]
    id_to_idx = {a['id']: i for i, a in enumerate(articles)}

    TOP_K = 25     # candidate pool size before MMR
    FINAL_N = 10   # neighbors written per article
    MMR_LAMBDA = 0.7

    print(f"Scoring pairs ({N}x{N}, top-{TOP_K} candidates → MMR top-{FINAL_N})...")
    out = {}
    for i, art in enumerate(articles):
        if i % 200 == 0 and i > 0:
            print(f"  {i}/{N}")
        scores = []
        ri = rows[i]
        ts_i = tags_set[i]
        tn_i = tag_norms[i]
        mt_i = art['master_title']
        sf_i = art['source_file']
        rel_i = related_set[i]
        id_i = art['id']

        for j, other in enumerate(articles):
            if i == j:
                continue
            cos = cosine(ri, rows[j])
            ts_j = tags_set[j]
            shared_any = bool(ts_i & ts_j) or cos > 0
            if not shared_any:
                continue

            tag_s = tag_overlap_score(ts_i, ts_j, tag_idf, tn_i, tag_norms[j])
            score = 1.0 * cos + 0.4 * tag_s

            if mt_i and mt_i == other['master_title']:
                score += 0.05
            if sf_i == other['source_file']:
                score += 0.03
            if other['id'] in rel_i or id_i in related_set[j]:
                score += 0.20

            if score > 0:
                scores.append((score, j, cos))

        scores.sort(reverse=True)
        candidates = scores[:TOP_K]

        # MMR diversity using raw TF-IDF cosine (not combined score)
        chosen = []
        chosen_idxs = []
        while candidates and len(chosen) < FINAL_N:
            best_mmr = -1e9
            best_pos = 0
            for k, (sc, j, cos) in enumerate(candidates):
                if not chosen_idxs:
                    mmr = sc
                else:
                    max_sim = max(cosine(rows[j], rows[c]) for c in chosen_idxs)
                    mmr = MMR_LAMBDA * sc - (1 - MMR_LAMBDA) * max_sim
                if mmr > best_mmr:
                    best_mmr = mmr
                    best_pos = k
            sc, j, _ = candidates.pop(best_pos)
            chosen.append({
                'id': articles[j]['id'],
                'score': round(sc, 3),
                'title': articles[j]['title'],
            })
            chosen_idxs.append(j)

        out[id_i] = chosen

    out_path = DATA / 'related_v2.json'
    print(f"Writing {out_path}...")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    size_kb = out_path.stat().st_size / 1024
    print(f"  {size_kb:.1f} KB")

    # Eval set — visual sanity check vs. baseline
    print()
    print("=" * 70)
    print("EVAL — top-3 vizinhos para casos de baseline conhecido:")
    print("=" * 70)
    for tid in ['johreivol01_01', 'johreivol03_05', 'pontosfocaisvol01_10']:
        if tid not in out or tid not in id_to_idx:
            continue
        cur = articles[id_to_idx[tid]]
        print(f"\n  {cur['title']}  [{tid}]")
        for r in out[tid][:3]:
            print(f"    [{r['score']:.3f}]  {r['title']}")


if __name__ == '__main__':
    main()
