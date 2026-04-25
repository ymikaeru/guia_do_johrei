# Limpa tags com prefixo ?:  — ex: "?:parte:ombros" -> "parte:ombros"
import json, os, glob

DATA = r'C:\Mioshie_Sites\guia_johrei\data'
VALID = ('parte:', 'condição:', 'técnica:')

files = [f for f in glob.glob(os.path.join(DATA, '*_bilingual.json'))
         if 'estudo_aprofundado' not in f]

total = 0
for path in files:
    with open(path, encoding='utf-8') as f:
        arts = json.load(f)
    changed = 0
    for a in arts:
        old = a.get('tags') or []
        new = []
        for t in old:
            # Strip ALL leading "?:" until we hit a valid axis or give up
            clean = t
            while clean.startswith('?:'):
                clean = clean[2:]
            if any(clean.startswith(ax) for ax in VALID):
                new.append(clean)
            elif clean:
                new.append(clean)  # keep unknown without ?:
        new = sorted(set(new))
        if new != old:
            a['tags'] = new
            changed += 1
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(arts, f, ensure_ascii=False, indent=2)
        total += changed
        print(os.path.basename(path) + ': ' + str(changed))

print('\nTotal: ' + str(total) + ' artigos corrigidos')

# Verify
from collections import Counter
parte, cond, tec, unk = Counter(), Counter(), Counter(), Counter()
for path in files:
    with open(path, encoding='utf-8') as f:
        for a in json.load(f):
            for t in (a.get('tags') or []):
                if t.startswith('parte:'): parte[t] += 1
                elif t.startswith('condição:'): cond[t] += 1
                elif t.startswith('técnica:'): tec[t] += 1
                else: unk[t] += 1

print('\nparte: ' + str(len(parte)) + ' tags distintas, ' + str(sum(parte.values())) + ' ocorrencias')
print('condição: ' + str(len(cond)) + ' tags distintas, ' + str(sum(cond.values())) + ' ocorrencias')
print('técnica: ' + str(len(tec)) + ' tags distintas, ' + str(sum(tec.values())) + ' ocorrencias')
if unk:
    print('sem eixo:', list(unk.keys()))
else:
    print('Todas as tags estao nos 3 eixos!')
