#!/usr/bin/env python3
"""
Add Focal Points (Pontos Focais) to Bilingual JSONs
Identifies and adds anatomical references to each item.
"""

import json
import os
from pathlib import Path
from collections import defaultdict

# Anatomical terms dictionary (same as extract_vital_points.py)
ANATOMICAL_TERMS = {
    # Cabeça e Pescoço
    'cabeça': ['cabeça', 'crânio', '頭'],
    'topo_da_cabeça': ['topo da cabeça', 'alto da cabeça', 'nōten', '脳天'],
    'cérebro': ['cérebro', 'brain', '脳'],
    'lobo_frontal': ['lobo frontal', 'frontal', 'região frontal', 'testa', 'fronte', '前頭部'],
    'região_occipital': ['região occipital', 'occipital', '後頭部'],
    'bulbo_raquidiano': ['bulbo raquidiano', 'bulbo', 'enzui', '延髄'],
    'nuca': ['nuca', 'região cervical posterior'],
    'pescoço': ['pescoço', 'cervical', '頸', '首'],
    'glândulas_linfáticas': ['glândula linfática', 'glândulas linfáticas', 'linfática cervical', '淋巴腺'],
    'glândula_parótida': ['glândula parótida', 'parótida', '耳下腺'],
    'olhos': ['olho', 'olhos', 'ocular', 'globo ocular', '眼', '目'],
    'sobrancelhas': ['sobrancelha', 'sobrancelhas', 'parte superior dos olhos'],
    'ouvidos': ['ouvido', 'ouvidos', 'orelha', '耳'],
    'nariz': ['nariz', 'nasal', 'ponte nasal', 'lados do nariz', '鼻'],
    'boca': ['boca', 'bucal', 'oral', 'cavidade bucal', '口'],
    'garganta': ['garganta', 'laringe', 'faringe', '咽喉', '喉'],
    'língua': ['língua', 'lingual', '舌'],
    'dentes': ['dente', 'dentes', 'dental', '歯'],
    'gengiva': ['gengiva', 'gengivas', '歯茎'],
    'amígdalas': ['amígdala', 'amígdalas', '扁桃腺'],
    'têmporas': ['têmpora', 'têmporas', 'temporal', 'こめかみ'],
    
    # Tórax e Abdômen
    'tórax': ['tórax', 'peito', 'torácico', '胸'],
    'coração': ['coração', 'cardíaco', 'região cardíaca', '心臓'],
    'pulmões': ['pulmão', 'pulmões', 'pulmonar', '肺'],
    'brônquios': ['brônquio', 'brônquios', 'bronquial', '気管支'],
    'estômago': ['estômago', 'gástrico', 'região gástrica', '胃'],
    'esôfago': ['esôfago', 'esofágico'],
    'abdômen': ['abdômen', 'abdominal', 'barriga'],
    'baixo_ventre': ['baixo ventre', 'baixo abdômen', '下腹部'],
    'diafragma': ['diafragma', '横隔膜'],
    'fígado': ['fígado', 'hepático', '肝臓'],
    'vesícula': ['vesícula', 'vesícula biliar', '胆嚢'],
    'pâncreas': ['pâncreas', 'pancreático', '膵臓'],
    'baço': ['baço', 'esplênico'],
    'intestinos': ['intestino', 'intestinos', 'intestinal', '腸'],
    
    # Costas e Coluna
    'costas': ['costas', 'dorsal', 'região dorsal', '背中'],
    'coluna': ['coluna', 'coluna vertebral', 'espinha', 'vertebral'],
    'omoplatas': ['omoplata', 'omoplatas', 'escápula', 'entre as omoplatas'],
    'região_lombar': ['região lombar', 'lombar', 'cintura', '腰'],
    'cóccix': ['cóccix', 'sacro', 'coccígeo', '尾底骨'],
    
    # Membros
    'ombros': ['ombro', 'ombros', '肩'],
    'braços': ['braço', 'braços', 'raiz do braço'],
    'axilas': ['axila', 'axilas', 'axilares'],
    'cotovelos': ['cotovelo', 'cotovelos'],
    'punhos': ['punho', 'punhos'],
    'mãos': ['mão', 'mãos', '手'],
    'dedos': ['dedo', 'dedos', 'polegar'],
    'virilha': ['virilha', 'região inguinal', 'inguinal'],
    'glúteos': ['glúteo', 'glúteos', 'nádegas'],
    'quadris': ['quadril', 'quadris'],
    'pernas': ['perna', 'pernas', '脚'],
    'joelhos': ['joelho', 'joelhos'],
    'tornozelos': ['tornozelo', 'tornozelos'],
    'pés': ['pé', 'pés', '足'],
    'coxas': ['coxa', 'coxas', 'lateral da coxa', '腿'],
    
    # Órgãos Internos
    'rins': ['rim', 'rins', 'renal', 'região renal', '腎臓'],
    'bexiga': ['bexiga', 'vesical', '膀胱'],
    'útero': ['útero', 'uterino'],
    'região_genital': ['região genital', 'genital', 'púbis', '陰部'],
    'ânus': ['ânus', 'anal', 'reto'],
    'próstata': ['próstata', 'prostático'],
}

# Category mapping for focal points
FOCAL_POINT_CATEGORIES = {
    'cabeça_pescoço': [
        'cabeça', 'topo_da_cabeça', 'cérebro', 'lobo_frontal', 'região_occipital',
        'bulbo_raquidiano', 'nuca', 'pescoço', 'glândulas_linfáticas', 'glândula_parótida',
        'olhos', 'sobrancelhas', 'ouvidos', 'nariz', 'boca', 'garganta', 'língua',
        'dentes', 'gengiva', 'amígdalas', 'têmporas'
    ],
    'tórax_abdômen': [
        'tórax', 'coração', 'pulmões', 'brônquios', 'estômago', 'esôfago',
        'abdômen', 'baixo_ventre', 'diafragma', 'fígado', 'vesícula',
        'pâncreas', 'baço', 'intestinos'
    ],
    'costas_coluna': [
        'costas', 'coluna', 'omoplatas', 'região_lombar', 'cóccix'
    ],
    'membros_superiores': [
        'ombros', 'braços', 'axilas', 'cotovelos', 'punhos', 'mãos', 'dedos'
    ],
    'membros_inferiores': [
        'virilha', 'glúteos', 'quadris', 'pernas', 'joelhos', 'tornozelos',
        'pés', 'coxas'
    ],
    'órgãos_internos': [
        'rins', 'bexiga', 'útero', 'região_genital', 'ânus', 'próstata'
    ]
}

def extract_focal_points(text):
    """Extract focal points (anatomical terms) from text."""
    text_lower = text.lower()
    focal_points = []
    
    for term_key, variants in ANATOMICAL_TERMS.items():
        for variant in variants:
            if variant.lower() in text_lower:
                focal_points.append(term_key)
                break
    
    return focal_points

def get_focal_point_regions(focal_points):
    """Get anatomical regions from focal points."""
    regions = set()
    for fp in focal_points:
        for region, terms in FOCAL_POINT_CATEGORIES.items():
            if fp in terms:
                regions.add(region)
    return list(regions)

def process_json_file(filepath):
    """Add focal points to a JSON file."""
    print(f"\nProcessing: {filepath.name}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        items = json.load(f)
    
    for item in items:
        # Combine title and content
        combined_text = f"{item.get('title_pt', '')} {item.get('content_pt', '')} {item.get('title_jp', '')} {item.get('content_jp', '')}"
        
        # Extract focal points
        focal_points = extract_focal_points(combined_text)
        
        # Get regions
        regions = get_focal_point_regions(focal_points)
        
        # Add to item
        item['pontos_focais'] = focal_points
        item['regiões_anatômicas'] = regions
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    
    # Stats
    avg_focal = sum(len(item.get('pontos_focais', [])) for item in items) / len(items)
    avg_regions = sum(len(item.get('regiões_anatômicas', [])) for item in items) / len(items)
    
    print(f"  ✓ Updated {len(items)} items")
    print(f"    Avg focal points: {avg_focal:.1f}")
    print(f"    Avg regions: {avg_regions:.1f}")
    
    return items

def main():
    base_dir = Path(__file__).parent.parent / "data"
    json_files = sorted((base_dir / "_source").glob("*_bilingual.json"))
    
    print("=" * 60)
    print("Adding Focal Points to Bilingual JSONs")
    print("=" * 60)
    
    total_items = 0
    for json_file in json_files:
        items = process_json_file(json_file)
        total_items += len(items)
    
    print("\n" + "=" * 60)
    print(f"Summary:")
    print(f"  Files processed: {len(json_files)}")
    print(f"  Total items: {total_items}")
    print(f"  Total anatomical terms: {len(ANATOMICAL_TERMS)}")
    print("=" * 60)

if __name__ == "__main__":
    main()
