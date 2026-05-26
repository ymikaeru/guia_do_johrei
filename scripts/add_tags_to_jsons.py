#!/usr/bin/env python3
"""
Automatic Tag Generation for Bilingual JSON Files
Adds tags, categories, and related item suggestions to all items.
"""

import json
import os
from pathlib import Path
from collections import defaultdict
import re

# Tag Taxonomy - Body Parts
BODY_PARTS = {
    'ombros': ['ombro', 'ombros', 'escápula', '肩'],
    'cabeça': ['cabeça', 'crânio', 'topo da cabeça', 'nōten', 'cérebro', 'cerebral', 'encéfalo', '頭', '脳天', '脳'],
    'bulbo_raquidiano': ['bulbo raquidiano', 'enzui', '延髄'],
    'região_occipital': ['região occipital', 'occipital', '後頭部'],
    'pescoço': ['pescoço', 'nuca', 'cervical', '頸', '首'],
    'olhos': ['olho', 'olhos', 'ocular', 'visão', '眼', '眼球'],
    'ouvidos': ['ouvido', 'ouvidos', 'auditivo', 'audição', '耳'],
    'nariz': ['nariz', 'nasal', 'olfato', '鼻'],
    'garganta': ['garganta', 'laringe', 'faringe', '咽喉', '喉'],
    'boca': ['boca', 'bucal', 'oral', '口腔'],
    'dentes': ['dente', 'dentes', 'dental', '歯'],
    'língua': ['língua', 'lingual', '舌'],
    'pulmões': ['pulmão', 'pulmões', 'pulmonar', '肺'],
    'coração': ['coração', 'cardíaco', 'cardíaca', '心臓'],
    'estômago': ['estômago', 'gástrico', 'gástrica', '胃'],
    'fígado': ['fígado', 'hepático', '肝臓'],
    'rins': ['rim', 'rins', 'renal', '腎臓'],
    'intestinos': ['intestino', 'intestinos', 'intestinal', '腸'],
    'pernas': ['perna', 'pernas', '脚'],
    'pés': ['pé', 'pés', '足首'],
    'mãos': ['mão', 'mãos', '手指'],
    'costas': ['costas', 'dorsal', '背中'],
    'cintura': ['cintura', 'lombar', '腰'],
    'glândulas_linfáticas': ['glândula linfática', 'linfática', 'linfonodo', '淋巴腺'],
    'parótida': ['parótida', 'glândula parótida', '耳下腺'],
    'amígdalas': ['amígdala', 'amígdalas', '扁桃腺'],
}

# Tag Taxonomy - Diseases
DISEASES = {
    'tuberculose': ['tuberculose', 'tísica', 'tubercular', '結核'],
    'asma': ['asma', 'asmático', 'asmática', '喘息'],
    'pneumonia': ['pneumonia', '肺炎'],
    'resfriado': ['resfriado', 'gripe', 'constipação', '風邪'],
    'anemia': ['anemia', 'anêmico', 'anemia cerebral', '貧血', '脳貧血'],
    'arteriosclerose': ['arteriosclerose', 'esclerose', '動脈硬化'],
    'hipertensão': ['hipertensão', 'pressão alta', '高血圧'],
    'diabetes': ['diabetes', 'diabético', 'diabética', '糖尿病'],
    'câncer': ['câncer', 'canceroso', 'maligno', '癌'],
    'paralisia': ['paralisia', 'paralítico', 'hemiplegia', 'derrame', '中風', '麻痺'],
    'meningite': ['meningite', 'meníngea', '脳膜炎'],
    'encefalite': ['encefalite', 'encefalite japonesa', '脳炎', '日本脳炎'],
    'glaucoma': ['glaucoma', '緑内障'],
    'catarata': ['catarata', '白内障'],
    'miopia': ['miopia', 'míope', '近視'],
    'sinusite': ['sinusite', 'chikunōshō', '蓄膿症'],
    'otite': ['otite', 'otite média', '中耳炎'],
    'amigdalite': ['amigdalite', 'inflamação', '扁桃腺炎'],
    'bronquite': ['bronquite', 'brônquios', '気管支炎'],
    'beribéri': ['beribéri', 'kakke', '脚気'],
    'doença_de_basedow': ['basedow', 'graves', 'tireoide', 'バセドー'],
    'amaurose': ['amaurose', 'sokohi', 'kurosokohi', '黒底翳'],
    'pleurisia': ['pleurisia', 'pleuris', 'pleurite', '胸膜炎'],
    'peritonite': ['peritonite', '腹膜炎'],
    'apendicite': ['apendicite', 'apêndice', '盲腸炎'],
    'tifo': ['tifo', 'tifóide', 'tifoide', '腸チフス'],
    'reumatismo': ['reumatismo', 'reumático', 'リウマチ'],
    'neurastenia': ['neurastenia', 'sistema nervoso', '神経衰弱'],
    'epilepsia': ['epilepsia', 'ataque epilético', 'てんかん'],
    'sarampo': ['sarampo', '麻疹'],
    'coqueluche': ['coqueluche', 'tosse convulsa', '百日咳'],
    'disenteria': ['disenteria', 'ekiri', '赤痢', '疫痢'],
}

# Tag Taxonomy - Symptoms
SYMPTOMS = {
    'febre': ['febre', 'febril', '発熱', '熱がある'],
    'dor': ['dor', 'doloroso', 'dolorosa', 'dói', '痛み', '痛い'],
    'tosse': ['tosse', 'tossir', '咳'],
    'catarro': ['catarro', 'expectoração', 'secreção', '痰'],
    'falta_de_ar': ['falta de ar', 'dispneia', 'respiração difícil', '息切れ'],
    'náusea': ['náusea', 'enjoo', 'ânsia', '吐気'],
    'vômito': ['vômito', 'vomitar', '嘔吐'],
    'diarreia': ['diarreia', 'disenteria', '下痢'],
    'tontura': ['tontura', 'vertigem', 'tonteira', '眩暈'],
    'insônia': ['insônia', 'sono', 'dormir', '不眠', '睡眠不足'],
    'fadiga': ['fadiga', 'cansaço', 'fraqueza', '疲労'],
    'inapetência': ['inapetência', 'falta de apetite', 'apetite', '食欲不振'],
    'rigidez': ['rigidez', 'rígido', 'rígida', 'duro', 'induração', '凝り', '固結'],
    'inchaço': ['inchaço', 'inchado', 'edema', '腫れ'],
    'sangramento': ['sangramento', 'hemorragia', 'sangue', '出血', '溢血'],
    'peso': ['peso', 'pesado', 'pressão', '重い'],
    'coceira': ['coceira', 'prurido', 'coçar', '痒み'],
}

# Tag Taxonomy - Techniques & Concepts
TECHNIQUES = {
    'pontos_vitais': ['ponto vital', 'pontos vitais', 'kyūsho', '急所'],
    'purificação': ['purificação', 'purificar', '浄化', '浄化作用'],
    'toxinas': ['toxina', 'toxinas', 'tóxico', 'veneno', '毒素', '毒'],
    'toxinas_medicamentosas': ['toxina medicamentosa', 'medicamento', 'remédio', 'yakudoku', '薬毒'],
    'autodiagnóstico': ['autodiagnóstico', 'auto-diagnóstico', 'diagnóstico', '健康診断', '診断'],
    'induração': ['induração', 'solidificação', 'endurecimento', '固結', '固まり'],
    'dissolução': ['dissolução', 'dissolver', 'solução', '溶解', '溶ける'],
    'johrei': ['johrei', 'jōrei', '浄霊'],
}

# Tag Taxonomy - Treatment Areas
TREATMENT_AREAS = {
    'região_superior': ['superior', 'parte superior', 'tórax', '上半身'],
    'região_inferior': ['inferior', 'parte inferior', 'abdômen', '下半身'],
    'órgãos_internos': ['órgão', 'órgãos internos', 'víscera', '内臓'],
    'sistema_nervoso': ['nervoso', 'neural', 'nervo', '神経'],
    'sistema_respiratório': ['respiratório', 'respiração', 'pulmonar', '呼吸'],
    'sistema_digestivo': ['digestivo', 'digestão', 'gastrointestinal', '消化'],
    'sistema_circulatório': ['circulatório', 'circulação', 'vascular', '循環'],
}

# Combine all taxonomies
ALL_TAGS = {
    **BODY_PARTS,
    **DISEASES,
    **SYMPTOMS,
    **TECHNIQUES,
    **TREATMENT_AREAS
}

# Category mapping
CATEGORY_MAPPING = {
    **{k: 'partes_do_corpo' for k in BODY_PARTS.keys()},
    **{k: 'doenças' for k in DISEASES.keys()},
    **{k: 'sintomas' for k in SYMPTOMS.keys()},
    **{k: 'técnicas_johrei' for k in TECHNIQUES.keys()},
    **{k: 'áreas_tratamento' for k in TREATMENT_AREAS.keys()},
}

def extract_tags(text_pt, text_jp):
    """Extract tags from Portuguese and Japanese text."""
    # Normalize text
    text_pt_lower = text_pt.lower()
    text_jp_lower = text_jp.lower()
    combined_text = f"{text_pt_lower} {text_jp_lower}"
    
    found_tags = set()
    
    for tag_name, keywords in ALL_TAGS.items():
        for keyword in keywords:
            keyword = keyword.lower()
            
            # Check if keyword is Japanese (contains non-ascii)
            is_japanese = any(ord(c) > 127 for c in keyword)
            
            if is_japanese:
                # Simple substring match for Japanese
                if keyword in text_jp_lower:
                    found_tags.add(tag_name)
                    break
            else:
                # Regex match with word boundaries for Portuguese/Latin
                # Escape the keyword to handle potential special regex chars
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, text_pt_lower):
                    found_tags.add(tag_name)
                    break
    
    return list(found_tags)

def get_categories(tags):
    """Get categories from tags."""
    categories = set()
    for tag in tags:
        if tag in CATEGORY_MAPPING:
            categories.add(CATEGORY_MAPPING[tag])
    return list(categories)

def find_related_items(item_id, item_tags, all_items, min_shared_tags=2, max_related=5):
    """Find related items based on tag overlap."""
    related = []
    
    for other_item in all_items:
        if other_item['id'] == item_id:
            continue
        
        other_tags = set(other_item.get('tags', []))
        shared_tags = set(item_tags) & other_tags
        
        if len(shared_tags) >= min_shared_tags:
            related.append({
                'id': other_item['id'],
                'score': len(shared_tags),
                'shared_tags': list(shared_tags)
            })
    
    # Sort by score and return top items
    related.sort(key=lambda x: x['score'], reverse=True)
    return [r['id'] for r in related[:max_related]]

def process_json_file(filepath):
    """Process a single JSON file and add tags."""
    print(f"\nProcessing: {filepath.name}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        items = json.load(f)
    
    # First pass: extract tags
    for item in items:
        title = f"{item.get('title_pt', '')} {item.get('title_jp', '')}"
        content = f"{item.get('content_pt', '')} {item.get('content_jp', '')}"
        
        tags = extract_tags(title, content)
        item['tags'] = tags
        item['categories'] = get_categories(tags)
    
    # Second pass: find related items
    for item in items:
        item['related_items'] = find_related_items(
            item['id'],
            item.get('tags', []),
            items
        )
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    
    # Stats
    avg_tags = sum(len(item.get('tags', [])) for item in items) / len(items)
    avg_related = sum(len(item.get('related_items', [])) for item in items) / len(items)
    
    print(f"  ✓ Updated {len(items)} items")
    print(f"    Avg tags: {avg_tags:.1f}")
    print(f"    Avg related: {avg_related:.1f}")
    
    return items

def main():
    base_dir = Path(__file__).parent.parent / "data"
    
    # Find all bilingual JSON files
    json_files = sorted((base_dir / "_source").glob("*_bilingual.json"))
    
    print("=" * 60)
    print("Automatic Tag Generation for Bilingual JSONs")
    print("=" * 60)
    
    all_items = []
    for json_file in json_files:
        items = process_json_file(json_file)
        all_items.extend(items)
    
    print("\n" + "=" * 60)
    print(f"Summary:")
    print(f"  Files processed: {len(json_files)}")
    print(f"  Total items: {len(all_items)}")
    print(f"  Total unique tags: {len(ALL_TAGS)}")
    print("=" * 60)

if __name__ == "__main__":
    main()
