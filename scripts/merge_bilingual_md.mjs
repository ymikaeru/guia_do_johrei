#!/usr/bin/env node
// ============================================================
// merge_bilingual_md.mjs
//
// Lê um MD bilíngue (Markdown/MD_PT_JP_v4/*.md) e injeta o
// conteudo_jp em cada artigo do tab_*.json correspondente,
// matcheando por título PT.
//
// O PT no MD é o legado (pré-§1.4) — não tocamos no `conteudo`
// (PT) do JSON, que tem a tradução nova v5_calibrated. Só pegamos
// o JP, que é a fonte original e não mudou.
//
// SEGURANÇA: dry-run por padrão. --confirm grava em data/tab_X.json.
//
// Uso:
//   node scripts/merge_bilingual_md.mjs --tab=fundamentos
//   node scripts/merge_bilingual_md.mjs --tab=fundamentos --confirm
//   node scripts/merge_bilingual_md.mjs --tab=critica_farmacologica
//   node scripts/merge_bilingual_md.mjs --tab=all
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const TAB_CONFIG = {
  fundamentos: {
    md:   'Markdown/MD_PT_JP_v4/Aba Fundamentos bilingue.md',
    json: 'data/tab_fundamentos.json',
  },
  critica_farmacologica: {
    md:   'Markdown/MD_PT_JP_v4/Aba Critica Farmacologica bilingue.md',
    json: 'data/tab_critica_farmacologica.json',
  },
  pratica: {
    md:   'Markdown/MD_PT_JP_v4/Aba Pratica bilingue.md',
    json: 'data/tab_pratica.json',
  },
  por_regiao: {
    // tab_por_regiao consolida 5 sub-fontes (Orientações por Purificação)
    md: [
      'Markdown/MD_PT_JP_v4/Aba Cabeca bilingue.md',
      'Markdown/MD_PT_JP_v4/Aba Doencas Femininas bilingue.md',
      'Markdown/MD_PT_JP_v4/Aba Estomago-Abdomen bilingue.md',
      'Markdown/MD_PT_JP_v4/Aba Olhos-Ouvidos-Nariz-Garganta-Dentes bilingue.md',
      'Markdown/MD_PT_JP_v4/Aba Tuberculose-Asma-Cardiacas bilingue.md',
    ],
    json: 'data/tab_por_regiao.json',
  },
};

const CONFIRM = !!args.confirm;
const REGERAR = !!args.regerar;  // se true: sobrescreve PT+JP a partir do MD (sync paragráfica 100%)
const tabsToProcess = args.tab === 'all' || !args.tab
  ? Object.keys(TAB_CONFIG)
  : [args.tab];

// ────────────────────────────────────────────────────────────
// Parsing do MD
// ────────────────────────────────────────────────────────────

// Normaliza título pra match: lowercase, remove escapes \. e marks
// como \[, normaliza fullwidth slash, collapse whitespace, remove
// pontuação não-essencial (vírgulas/pontos/parênteses/aspas) pra
// tolerar variações como "etc., e" vs "etc. e".
function normalizeTitle(s) {
  return String(s || '')
    .replace(/\\([._\[\]])/g, '$1')      // remove escapes markdown
    .replace(/[／/]/g, '/')              // fullwidth slash → ascii
    .replace(/\s*\((?:Ensinamento|Ensinamentos)\b[^)]*\)\s*$/i, '') // sufixo "(Ensinamento)" / "(Ensinamentos N)" do JSON
    .replace(/[,.;:()"'*]/g, ' ')         // remove pontuação não-estrutural
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Regex de prefixo numérico: aceita "1.", "1.2.", "I.", "I.1.", etc.
const NUMERIC_PREFIX_RE = /^(?:\d+(?:\.\d+)?|[IVX]+(?:\.\d+)?)\\?\.\s*/;

// Extrai só a parte PT do título "PT ／ JP" (ou só PT se sem slash).
function extractPtTitle(headingText) {
  let cleaned = headingText.replace(NUMERIC_PREFIX_RE, '').trim();
  const slashIdx = cleaned.search(/[／/]/);
  if (slashIdx >= 0) cleaned = cleaned.slice(0, slashIdx).trim();
  return cleaned;
}

// Extrai só a parte JP do título "PT ／ JP" (ou null se sem slash).
function extractJpTitle(headingText) {
  let cleaned = headingText.replace(NUMERIC_PREFIX_RE, '').trim();
  const slashIdx = cleaned.search(/[／/]/);
  if (slashIdx >= 0) return cleaned.slice(slashIdx + 1).trim();
  return null;
}

// Parse: percorre linhas, encontra blocos de artigo.
// Um artigo válido = heading (## ou ###) seguido eventualmente
// por `### PT` ... `### JP` ... (próximo heading ou fim).
function parseBilingualMd(text) {
  const lines = text.split('\n');
  const articles = [];

  // Detecta linhas de heading que parecem ser artigos (não índice/sub-aba/seção)
  // ## N\. Title  → top-level article (numérico)
  // ### N.X\. Title  → sub-item article
  // ### I.1\. Title → orientações com numeração romana
  // Ignora: # Sub-aba: ..., ## Índice, ### PT, ### JP, ### Ensinamentos (N)
  const headingRe = /^(#{2,3})\s+((?:\d+(?:\.\d+)?|[IVX]+(?:\.\d+)?)(?:\\)?\.\s+.+?)\s*$/;

  // Acha índices de todos os headings de artigo
  const headingIdxs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingRe);
    if (m) headingIdxs.push({ line: i, level: m[1].length, raw: m[2] });
  }

  for (let h = 0; h < headingIdxs.length; h++) {
    const { line: startLine, raw } = headingIdxs[h];
    const endLine = h + 1 < headingIdxs.length ? headingIdxs[h + 1].line : lines.length;
    const blockLines = lines.slice(startLine + 1, endLine);

    // Procura "### PT"/"#### PT" e correspondente JP dentro do bloco.
    // Top-level (##) usa ### PT/JP; sub-itens (###) usam #### PT/JP.
    let ptStart = -1, jpStart = -1, ptHeaderLine = -1;
    for (let i = 0; i < blockLines.length; i++) {
      const t = blockLines[i].trim();
      if ((t === '### PT' || t === '#### PT') && ptStart < 0) {
        ptStart = i + 1; ptHeaderLine = i;
      } else if ((t === '### JP' || t === '#### JP') && jpStart < 0) {
        jpStart = i + 1;
      }
    }

    // Só conta como artigo se tem AMBOS PT e JP
    if (ptStart < 0 || jpStart < 0) continue;

    // PT vai de ptStart até jpStart-1 (descontando "### JP"/"#### JP")
    const ptLines = blockLines.slice(ptStart, jpStart - 1);
    // JP vai de jpStart até o fim do bloco
    const jpLines = blockLines.slice(jpStart);

    const ptTitle = extractPtTitle(raw);

    // Limpa trailing "---" (separadores de artigo) e whitespace
    function stripTrailingSeparators(s) {
      return s.replace(/(?:\s*\n)?\s*---+\s*$/gm, '').trim();
    }

    articles.push({
      headingRaw: raw,
      ptTitle,
      jpTitle: extractJpTitle(raw),
      ptContent: stripTrailingSeparators(ptLines.join('\n')),
      jpContent: stripTrailingSeparators(jpLines.join('\n')),
    });
  }

  return articles;
}

// ────────────────────────────────────────────────────────────
// Match com JSON
// ────────────────────────────────────────────────────────────

function flattenJsonArticles(json) {
  const flat = [];
  json.sub_abas.forEach((sub, sIdx) => {
    sub.categorias.forEach((cat, cIdx) => {
      cat.artigos.forEach((art, aIdx) => {
        flat.push({ art, path: [sIdx, cIdx, aIdx], titleNorm: normalizeTitle(art.titulo) });
      });
    });
  });
  return flat;
}

// ────────────────────────────────────────────────────────────
// Modo --regerar: sobrescreve conteudo (PT) E conteudo_jp do JSON
// a partir do MD bilíngue. Garante bijeção paragráfica 100%.
// Casa leaves direto por título; agregadores (artigos JSON com
// `### N. Sub-título` no conteudo) reconstrói montando os sub-itens
// na mesma ordem espelhada em PT e JP.
// ────────────────────────────────────────────────────────────

// Extrai sub-headings "### N. Título" do conteudo de um artigo JSON.
// Exige título na MESMA linha do "### N." — senão é só marcador
// numérico vazio (caso pratica_001) e o artigo é leaf, não agregador.
function extractSubTitles(conteudo) {
  const re = /^### (\d+)\.[ \t]+(.+?)\s*$/gm;
  const out = [];
  let m;
  while ((m = re.exec(conteudo)) !== null) {
    const title = m[2].trim();
    if (!title) continue;  // marcador vazio
    out.push({ num: parseInt(m[1], 10), title });
  }
  return out;
}

// Tenta regerar conteudo + conteudo_jp para um artigo JSON.
// Retorna { conteudo, conteudo_jp, mode, subsFound, subsTotal } ou null se nenhum match.
function regerarArticle(jsonArt, mdMap) {
  const conteudo = jsonArt.conteudo || '';
  const subTitles = extractSubTitles(conteudo);

  // Leaf: artigo sem sub-headings → match direto por título do artigo
  if (subTitles.length === 0) {
    const titleNorm = normalizeTitle(jsonArt.titulo);
    const md = mdMap.get(titleNorm);
    if (!md) return null;
    return {
      conteudo: md.ptContent,
      conteudo_jp: md.jpContent,
      mode: 'leaf',
      subsFound: 1,
      subsTotal: 1,
    };
  }

  // Agregador: monta PT e JP espelhados a partir dos sub-itens do MD
  const ptParts = [];
  const jpParts = [];
  const missing = [];
  for (const sub of subTitles) {
    const subNorm = normalizeTitle(sub.title);
    const md = mdMap.get(subNorm);
    if (!md) {
      missing.push(sub.title);
      continue;
    }
    ptParts.push(`### ${sub.num}\\. ${md.ptTitle}\n\n${md.ptContent}`);
    const jpTitle = md.jpTitle || md.ptTitle;
    jpParts.push(`### ${sub.num}\\. ${jpTitle}\n\n${md.jpContent}`);
  }

  if (ptParts.length === 0) return null;

  return {
    conteudo: '\n' + ptParts.join('\n\n'),
    conteudo_jp: '\n' + jpParts.join('\n\n'),
    mode: 'aggregator',
    subsFound: ptParts.length,
    subsTotal: subTitles.length,
    missing,
  };
}

function matchArticles(mdArticles, jsonFlat) {
  const matched = [];
  const unmatched = [];
  const usedJsonIdx = new Set();

  for (const md of mdArticles) {
    const mdNorm = normalizeTitle(md.ptTitle);
    // Tenta match exato (case-insensitive normalizado)
    const hit = jsonFlat.findIndex((j, i) =>
      !usedJsonIdx.has(i) && j.titleNorm === mdNorm
    );
    if (hit >= 0) {
      usedJsonIdx.add(hit);
      matched.push({ md, json: jsonFlat[hit] });
    } else {
      unmatched.push({ md, mdNorm });
    }
  }

  // JSON articles que nenhum MD casou
  const orphanJson = jsonFlat.filter((_, i) => !usedJsonIdx.has(i));

  return { matched, unmatched, orphanJson };
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function processTab(tabKey) {
  const cfg = TAB_CONFIG[tabKey];
  if (!cfg) {
    console.error(`✗ Tab desconhecida: ${tabKey}`);
    return null;
  }

  console.log(`\n━━━ ${tabKey} ━━━`);
  const mdPaths = Array.isArray(cfg.md) ? cfg.md : [cfg.md];
  console.log(`MD:   ${mdPaths.length === 1 ? mdPaths[0] : `${mdPaths.length} arquivos`}`);
  if (mdPaths.length > 1) mdPaths.forEach(p => console.log(`        · ${p}`));
  console.log(`JSON: ${cfg.json}`);

  const jsonRaw = await fs.readFile(cfg.json, 'utf8');
  const json = JSON.parse(jsonRaw);

  // Parseia cada MD separadamente e concatena os artigos detectados
  const mdArticles = [];
  for (const mdPath of mdPaths) {
    const mdText = await fs.readFile(mdPath, 'utf8');
    const arts = parseBilingualMd(mdText);
    arts.forEach(a => { a._sourceMd = mdPath; });
    mdArticles.push(...arts);
    if (mdPaths.length > 1) {
      console.log(`  ${mdPath.split(/[\\/]/).pop()}: ${arts.length} artigos`);
    }
  }
  const jsonFlat = flattenJsonArticles(json);

  console.log(`MD: ${mdArticles.length} artigos com PT+JP detectados`);
  console.log(`JSON: ${jsonFlat.length} artigos`);

  // ─── Modo --regerar ───────────────────────────────────────
  if (REGERAR) {
    // Constrói mapa título-normalizado → MD article
    const mdMap = new Map();
    for (const md of mdArticles) {
      const norm = normalizeTitle(md.ptTitle);
      if (!mdMap.has(norm)) mdMap.set(norm, md);
    }

    let leafCount = 0, aggCount = 0, skipped = 0, partial = 0;
    const skippedTitles = [];
    const aggregatorReport = [];

    for (const j of jsonFlat) {
      const res = regerarArticle(j.art, mdMap);
      if (!res) {
        skipped++;
        skippedTitles.push(j.art.titulo || j.art.id);
        continue;
      }
      if (res.mode === 'leaf') leafCount++;
      else {
        aggCount++;
        if (res.subsFound < res.subsTotal) {
          partial++;
          aggregatorReport.push({ id: j.art.id, titulo: j.art.titulo, found: res.subsFound, total: res.subsTotal, missing: res.missing });
        }
      }
      const [s, c, a] = j.path;
      json.sub_abas[s].categorias[c].artigos[a].conteudo = res.conteudo;
      json.sub_abas[s].categorias[c].artigos[a].conteudo_jp = res.conteudo_jp;
    }

    console.log(`\n━━ MODO REGERAR ━━`);
    console.log(`Leaves regerados:     ${leafCount}`);
    console.log(`Agregadores regerados: ${aggCount} (${partial} parciais)`);
    console.log(`Artigos não casados:  ${skipped}`);

    if (skippedTitles.length) {
      console.log(`\nNão casados (primeiros 10):`);
      skippedTitles.slice(0, 10).forEach(t => console.log(`  - ${t}`));
    }
    if (aggregatorReport.length) {
      console.log(`\nAgregadores com sub-itens faltando (primeiros 5):`);
      aggregatorReport.slice(0, 5).forEach(r => {
        console.log(`  ${r.id} "${(r.titulo||'').slice(0,50)}": ${r.found}/${r.total}`);
        r.missing.slice(0, 3).forEach(m => console.log(`      ⚠ "${m.slice(0,80)}"`));
      });
    }

    if (CONFIRM) {
      // Backup
      const bakPath = cfg.json + '.bak';
      await fs.writeFile(bakPath, jsonRaw, 'utf8');
      console.log(`\n💾 Backup: ${bakPath}`);
      await fs.writeFile(cfg.json, JSON.stringify(json, null, 2), 'utf8');
      console.log(`✅ Gravado: ${cfg.json} (${leafCount + aggCount} artigos regerados)`);
    } else {
      console.log(`\n━━━ DRY-RUN — nada gravado. Use --confirm pra aplicar. ━━━`);
    }

    return { tabKey, matched: [], unmatched: [], orphanJson: [], regerar: { leafCount, aggCount, skipped, partial } };
  }

  const { matched, unmatched, orphanJson } = matchArticles(mdArticles, jsonFlat);

  console.log(`\nMatched: ${matched.length}`);
  console.log(`Unmatched (MD sem par no JSON): ${unmatched.length}`);
  console.log(`Orphan (JSON sem par no MD): ${orphanJson.length}`);

  // Mostra primeiros samples
  if (matched.length) {
    console.log('\nPrimeiros 3 matches:');
    matched.slice(0, 3).forEach(m => {
      console.log(`  ✓ "${m.md.ptTitle.slice(0,60)}" → ${m.json.art.id} (jp len: ${m.md.jpContent.length})`);
    });
  }
  if (unmatched.length) {
    console.log('\nUnmatched (primeiros 10):');
    unmatched.slice(0, 10).forEach(u => {
      console.log(`  ? "${u.md.ptTitle.slice(0,80)}"`);
    });
  }
  if (orphanJson.length) {
    console.log('\nOrphan JSON (primeiros 10):');
    orphanJson.slice(0, 10).forEach(o => {
      console.log(`  - ${o.art.id}: "${(o.art.titulo || '').slice(0,80)}"`);
    });
  }

  // Aplica ou simula
  if (matched.length === 0) {
    console.log('\n⚠ Nenhum match — nada a fazer.');
    return { tabKey, matched, unmatched, orphanJson };
  }

  if (CONFIRM) {
    for (const m of matched) {
      const [s, c, a] = m.json.path;
      json.sub_abas[s].categorias[c].artigos[a].conteudo_jp = m.md.jpContent;
    }
    await fs.writeFile(cfg.json, JSON.stringify(json, null, 2), 'utf8');
    console.log(`\n✅ Gravado: ${cfg.json} (${matched.length} artigos com conteudo_jp injetado)`);
  } else {
    console.log(`\n━━━ DRY-RUN — nada gravado. Use --confirm pra aplicar. ━━━`);
  }

  return { tabKey, matched, unmatched, orphanJson };
}

const reports = [];
for (const tab of tabsToProcess) {
  const r = await processTab(tab);
  if (r) reports.push(r);
}

// Relatório global
const reportPath = `unmatched_report.json`;
const reportData = reports.map(r => ({
  tab: r.tabKey,
  stats: {
    md_total: r.matched.length + r.unmatched.length,
    matched: r.matched.length,
    unmatched: r.unmatched.length,
    orphan_json: r.orphanJson.length,
  },
  unmatched_md: r.unmatched.map(u => ({
    titulo_pt_md: u.md.ptTitle,
    heading_raw: u.md.headingRaw,
    jp_preview: u.md.jpContent.slice(0, 100),
  })),
  orphan_json: r.orphanJson.map(o => ({
    id: o.art.id,
    titulo: o.art.titulo,
  })),
}));
await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2), 'utf8');
console.log(`\n📋 Relatório: ${reportPath}`);
