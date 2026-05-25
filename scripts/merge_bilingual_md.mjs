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
};

const CONFIRM = !!args.confirm;
const tabsToProcess = args.tab === 'all' || !args.tab
  ? Object.keys(TAB_CONFIG)
  : [args.tab];

// ────────────────────────────────────────────────────────────
// Parsing do MD
// ────────────────────────────────────────────────────────────

// Normaliza título pra match: lowercase, remove escapes \. e marks
// como \[, normaliza fullwidth slash, collapse whitespace.
function normalizeTitle(s) {
  return String(s || '')
    .replace(/\\([._\[\]])/g, '$1')      // remove escapes markdown
    .replace(/[／/]/g, '/')              // fullwidth slash → ascii
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Extrai só a parte PT do título "PT ／ JP" (ou só PT se sem slash).
function extractPtTitle(headingText) {
  // Remove numeração inicial "N. " ou "N.X. "
  let cleaned = headingText.replace(/^\d+(\.\d+)?\\?\.\s*/, '').trim();
  // Split por fullwidth slash ／ ou ascii /
  const slashIdx = cleaned.search(/[／/]/);
  if (slashIdx >= 0) cleaned = cleaned.slice(0, slashIdx).trim();
  return cleaned;
}

// Parse: percorre linhas, encontra blocos de artigo.
// Um artigo válido = heading (## ou ###) seguido eventualmente
// por `### PT` ... `### JP` ... (próximo heading ou fim).
function parseBilingualMd(text) {
  const lines = text.split('\n');
  const articles = [];

  // Detecta linhas de heading que parecem ser artigos (não índice/sub-aba/seção)
  // ## N\. Title  → top-level article
  // ### N.X\. Title  → sub-item article
  // Ignora: # Sub-aba: ..., ## Índice, ### PT, ### JP, ### Ensinamentos (N)
  const headingRe = /^(#{2,3})\s+(\d+(?:\.\d+)?(?:\\)?\.\s+.+?)\s*$/;

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

    // PT vai de ptStart até jpStart-1 (descontando "### JP")
    const ptLines = blockLines.slice(ptStart, jpStart - 1);
    // JP vai de jpStart até o fim do bloco
    const jpLines = blockLines.slice(jpStart);

    const ptTitle = extractPtTitle(raw);

    articles.push({
      headingRaw: raw,
      ptTitle,
      ptContent: ptLines.join('\n').trim(),
      jpContent: jpLines.join('\n').trim(),
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
  console.log(`MD:   ${cfg.md}`);
  console.log(`JSON: ${cfg.json}`);

  const mdText = await fs.readFile(cfg.md, 'utf8');
  const jsonRaw = await fs.readFile(cfg.json, 'utf8');
  const json = JSON.parse(jsonRaw);

  const mdArticles = parseBilingualMd(mdText);
  const jsonFlat = flattenJsonArticles(json);

  console.log(`MD: ${mdArticles.length} artigos com PT+JP detectados`);
  console.log(`JSON: ${jsonFlat.length} artigos`);

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
