import glob
import os
import codecs

def remove_bom(filepath):
    with open(filepath, 'rb') as f:
        content = f.read()
    if content.startswith(codecs.BOM_UTF8):
        content = content[len(codecs.BOM_UTF8):]
        with open(filepath, 'wb') as f:
            f.write(content)
        print(f"Removed BOM from {filepath}")

for f in glob.glob('data/*.json'):
    remove_bom(f)
