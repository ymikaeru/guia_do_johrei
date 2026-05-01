import json
from pathlib import Path

# Verifica se existem backups do strategy_a
data = Path('data')
baks = sorted(data.glob('johrei_vol03*.bak.bijection_a.*'))
for b in baks:
    print(b)

if not baks:
    print("Nenhum backup bijection_a encontrado para vol03!")
    # Verificar todos os vols
    for f in sorted(data.glob('*.bak.bijection_a.*')):
        print(f)
