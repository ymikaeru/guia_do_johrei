#!/usr/bin/env python3
"""
Convert Bilingual JSONs to Site-Compatible Format
Maps new structure to old site structure
"""

import json
from pathlib import Path
import re

# Type mapping based on source volume
TYPE_MAPPING = {
    'johrei_vol01': 'Fundamentos',
    'johrei_vol02': 'Fundamentos',
    'johrei_vol03': 'Perguntas e Orientações',
    'johrei_vol04': 'Perguntas e Orientações',
    'johrei_vol05': 'Perguntas e Orientações',
    'johrei_vol06': 'Perguntas e Orientações',
    'johrei_vol07': 'Perguntas e Orientações',
    'johrei_vol08': 'Perguntas e Orientações',
    'johrei_vol09': 'Perguntas e Orientações',
    'johrei_vol10': 'Perguntas e Orientações',
    'pontos_focais_vol01': 'Pontos Focais',
    'pontos_focais_vol02': 'Pontos Focais',
}

def get_source_name(volume):
    """Get source name from volume identifier."""
    vol_map = {
        'johrei_vol01': 'Johrei Hō Kōza Vol.01',
        'johrei_vol02': 'Johrei Hō Kōza Vol.02',
        'johrei_vol03': 'Johrei Hō Kōza Vol.03',
        'johrei_vol04': 'Johrei Hō Kōza Vol.04',
        'johrei_vol05': 'Johrei Hō Kōza Vol.05',
        'johrei_vol06': 'Johrei Hō Kōza Vol.06',
        'johrei_vol07': 'Johrei Hō Kōza Vol.07',
        'johrei_vol08': 'Johrei Hō Kōza Vol.08',
        'johrei_vol09': 'Johrei Hō Kōza Vol.09',
        'johrei_vol10': 'Johrei Hō Kōza Vol.10',
        'pontos_focais_vol01': 'Pontos Focais Vol.01',
        'pontos_focais_vol02': 'Pontos Focais Vol.02',
    }
    return vol_map.get(volume, volume)

def capitalize_focus_point(focus_point):
    """Capitalize focus point names properly."""
    # Map from internal names to display names
    display_names = {
        'cabeça': 'Cabeça',
        'topo_da_cabeça': 'Topo da Cabeça',
        'cérebro': 'Cérebro',
        'lobo_frontal': 'Lobo Frontal',
        'região_occipital': 'Região Occipital',
        'bulbo_raquidiano': 'Bulbo Raquidiano',
        'nuca': 'Nuca',
        'pescoço': 'Pescoço',
        'glândulas_linfáticas': 'Glândulas Linfáticas',
        'glândula_parótida': 'Glândula Parótida',
        'olhos': 'Olhos',
        'sobrancelhas': 'Sobrancelhas',
        'ouvidos': 'Ouvidos',
        'nariz': 'Nariz',
        'boca': 'Boca',
        'garganta': 'Garganta',
        'língua': 'Língua',
        'dentes': 'Dentes',
        'gengiva': 'Gengiva',
        'amígdalas': 'Amígdalas',
        'têmporas': 'Têmporas',
        'tórax': 'Tórax',
        'coração': 'Coração',
        'pulmões': 'Pulmões',
        'brônquios': 'Brônquios',
        'estômago': 'Estômago',
        'esôfago': 'Esôfago',
        'abdômen': 'Abdômen',
        'baixo_ventre': 'Baixo Ventre',
        'diafragma': 'Diafragma',
        'fígado': 'Fígado',
        'vesícula': 'Vesícula',
        'pâncreas': 'Pâncreas',
        'baço': 'Baço',
        'intestinos': 'Intestinos',
        'costas': 'Costas',
        'coluna': 'Coluna',
        'omoplatas': 'Omoplatas',
        'região_lombar': 'Região Lombar',
        'cóccix': 'Cóccix',
        'ombros': 'Ombros',
        'braços': 'Braços',
        'axilas': 'Axilas',
        'cotovelos': 'Cotovelos',
        'punhos': 'Punhos',
        'mãos': 'Mãos',
        'dedos': 'Dedos',
        'virilha': 'Virilha',
        'glúteos': 'Glúteos',
        'quadris': 'Quadris',
        'pernas': 'Pernas',
        'joelhos': 'Joelhos',
        'tornozelos': 'Tornozelos',
        'pés': 'Pés',
        'coxas': 'Coxas',
        'rins': 'Rins',
        'bexiga': 'Bexiga',
        'útero': 'Útero',
        'região_genital': 'Região Genital',
        'ânus': 'Ânus',
        'próstata': 'Próstata',
    }
    return display_names.get(focus_point, focus_point.replace('_', ' ').title())

def convert_item(item, volume_base):
    """Convert bilingual item to site format."""
    # Get volume number from id
    vol_match = re.search(r'vol(\d+)', item['id'])
    volume_num = vol_match.group(1) if vol_match else '01'
    
    source = get_source_name(volume_base)
    item_type = TYPE_MAPPING.get(volume_base, 'Perguntas e Orientações')
    
    # Combine Portuguese and Japanese content
    title = item.get('title_pt', '')
    content = item.get('content_pt', '')
    
    # Add Japanese content if available
    if item.get('content_jp'):
        content += f"\n\n---\n\n**Original (Japonês):**\n\n{item.get('content_jp', '')}"
    
    # Capitalize tags
    tags = [tag.replace('_', ' ').title() for tag in item.get('tags', [])]
    
    # Format focus points
    focus_points = [capitalize_focus_point(fp) for fp in item.get('pontos_focais', [])]
    
    return {
        'id': item['id'],
        'title': title,
        'content': content,
        'source': source,
        'tags': tags,
        'order': item.get('order', 1),
        'type': item_type,
        'focusPoints': focus_points
    }

def convert_file(filepath):
    """Convert a bilingual JSON file to site format."""
    print(f"\nConverting: {filepath.name}")
    
    # Get volume base name
    volume_base = filepath.stem.replace('_bilingual', '')
    
    with open(filepath, 'r', encoding='utf-8') as f:
        items = json.load(f)
    
    # Convert all items
    converted = [convert_item(item, volume_base) for item in items]
    
    # Save to new file
    output_file = filepath.parent / f"{volume_base}_site.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(converted, f, ensure_ascii=False, indent=2)
    
    print(f"  ✓ Converted {len(converted)} items → {output_file.name}")
    
    return len(converted)

def main():
    base_dir = Path(__file__).parent.parent / "data"
    json_files = sorted(base_dir.glob("*_bilingual.json"))
    
    print("=" * 60)
    print("Converting Bilingual JSONs to Site Format")
    print("=" * 60)
    
    total_items = 0
    for json_file in json_files:
        count = convert_file(json_file)
        total_items += count
    
    print("\n" + "=" * 60)
    print(f"Summary:")
    print(f"  Files converted: {len(json_files)}")
    print(f"  Total items: {total_items}")
    print(f"  Output: *_site.json files")
    print("=" * 60)

if __name__ == "__main__":
    main()
