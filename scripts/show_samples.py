import json
import re
from pathlib import Path

data_dir = Path("c:/Mioshie_Sites/guia_johrei/data")

# Check multi-turn article JK2_7
data = json.load(open(data_dir / "estudo_aprofundado_JK2_bilingual.json", encoding="utf-8"))
item = next((x for x in data if x.get("id") == "JK2_7"), None)
if item:
    print("=== JK2_7 ===", item.get("title_pt"))
    print(item.get("content_pt", "")[:3000])

print("\n\n=== JK11_6 ===")
data = json.load(open(data_dir / "estudo_aprofundado_JK11_bilingual.json", encoding="utf-8"))
item = next((x for x in data if x.get("id") == "JK11_6"), None)
if item:
    print(item.get("content_pt", "")[:2500])
