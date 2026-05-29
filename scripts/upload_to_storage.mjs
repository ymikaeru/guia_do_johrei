#!/usr/bin/env node
// ============================================================
// upload_to_storage.mjs — sobe os JSONs/MDs editáveis do guia_johrei
// pro bucket Supabase `guia-data`.
//
// Whitelist explícita dos 12 arquivos que o frontend realmente lê.
// Os ~30 *_bilingual.json individuais NÃO sobem — ficam no repo como
// source-of-truth pros build_tab_*.py (já marcados como legados).
//
// SEGURANÇA: dry-run por padrão. Só executa com --confirm.
//
// Requer: Node 18+ (fetch built-in). Sem npm install.
//
// Uso:
//   node scripts/upload_to_storage.mjs            # dry-run (mostra plano)
//   node scripts/upload_to_storage.mjs --confirm  # executa
//
// Env (lido de .env.local ou shell):
//   SUPABASE_URL=https://succhmnbajvbpmoqrktq.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  (NUNCA commitar)
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';

const BUCKET = 'guia-data';
const DATA_DIR = 'data';

// Whitelist: o que o frontend lê (core.js, guide.js, culto-mensal.js).
// MP3 do culto fica fora — não cabe no escopo "editar conteúdo".
const WHITELIST = [
  'index.json',
  'tab_fundamentos.json',
  'tab_pratica.json',
  'tab_critica_farmacologica.json',
  'tab_por_regiao.json',
  'tab_estudo_aprofundado.json',
  'tab_estudo_detalhado.json',
  'guia_atendimento.json',
  'synonyms_pt.json',
  'related_v2.json',
  'culto_mensal_atual.md',
  'culto_mensal_atual.timestamps.json',
];

// ---------------- env ----------------
async function loadEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const txt = await fs.readFile('.env.local', 'utf8');
    for (const raw of txt.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

// ---------------- args ----------------
const argv = process.argv.slice(2);
const CONFIRM = argv.includes('--confirm');
// Argumentos posicionais (sem "--") restringem o upload a um subconjunto
// da whitelist. Sem nenhum, sobe a whitelist inteira.
//   node scripts/upload_to_storage.mjs --confirm tab_pratica.json
const fileArgs = argv.filter((a) => !a.startsWith('--'));

// ---------------- helpers ----------------
function contentTypeFor(filename) {
  if (filename.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filename.endsWith('.md'))   return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

async function uploadOne(supabaseUrl, serviceKey, filename, buffer) {
  // Storage REST: POST /storage/v1/object/{bucket}/{path}
  // Header x-upsert: true → sobrescreve se já existir.
  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': contentTypeFor(filename),
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
  }
}

// ---------------- main ----------------
await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.');
  console.error('   Crie .env.local com:');
  console.error('     SUPABASE_URL=https://succhmnbajvbpmoqrktq.supabase.co');
  console.error('     SUPABASE_SERVICE_ROLE_KEY=<service_role_key do Dashboard>');
  console.error('   .env.local já está no .gitignore.');
  process.exit(1);
}

console.log(`📤 Upload para Supabase bucket "${BUCKET}"`);
console.log(`   Projeto: ${SUPABASE_URL}`);
console.log(`   Origem: ${path.resolve(DATA_DIR)}/`);
console.log(`   Modo: ${CONFIRM ? 'EXECUTAR' : 'DRY-RUN (use --confirm pra subir)'}\n`);

// Define quais arquivos subir: subconjunto pedido (validado) ou whitelist inteira.
let uploadList = WHITELIST;
if (fileArgs.length) {
  const forbidden = fileArgs.filter((f) => !WHITELIST.includes(f));
  if (forbidden.length) {
    console.error('❌ Arquivos fora da whitelist (não permitido subir):');
    for (const f of forbidden) console.error(`   ${f}`);
    console.error('\n   Whitelist:');
    for (const f of WHITELIST) console.error(`   ${f}`);
    process.exit(1);
  }
  uploadList = fileArgs;
  console.log(`   Subconjunto: ${uploadList.length}/${WHITELIST.length} arquivos\n`);
}

// Validar que todos os arquivos existem antes de começar
const plan = [];
let totalBytes = 0;
const missing = [];

for (const filename of uploadList) {
  const full = path.join(DATA_DIR, filename);
  try {
    const stat = await fs.stat(full);
    plan.push({ filename, size: stat.size, full });
    totalBytes += stat.size;
  } catch (e) {
    if (e.code === 'ENOENT') missing.push(filename);
    else throw e;
  }
}

if (missing.length) {
  console.error(`❌ Arquivos da whitelist não encontrados em ${DATA_DIR}/:`);
  for (const m of missing) console.error(`   ${m}`);
  process.exit(1);
}

console.log(`📋 Plano: ${plan.length} arquivos, ${(totalBytes/1024/1024).toFixed(2)} MB total\n`);
for (const p of plan) {
  console.log(`   ${p.filename.padEnd(40)} ${(p.size/1024).toFixed(1).padStart(8)} KB`);
}
console.log('');

if (!CONFIRM) {
  console.log('━━━ DRY-RUN — nada foi enviado ━━━');
  console.log('Adicione --confirm pra subir de verdade.');
  process.exit(0);
}

console.log('🚀 Subindo…');
let ok = 0;
const errors = [];

for (const p of plan) {
  const buffer = await fs.readFile(p.full);
  try {
    await uploadOne(SUPABASE_URL, SERVICE_KEY, p.filename, buffer);
    ok++;
    process.stdout.write(`   ✓ ${p.filename}\n`);
  } catch (e) {
    errors.push({ filename: p.filename, error: e.message });
    process.stdout.write(`   ✗ ${p.filename} — ${e.message}\n`);
  }
}

console.log(`\n✅ ${ok}/${plan.length} arquivos enviados.`);

if (errors.length) {
  console.error(`\n⚠ ${errors.length} falha(s):`);
  for (const e of errors) console.error(`   ${e.filename}: ${e.error}`);
  process.exit(1);
}

// Sanity-check: pegue um GET público pra confirmar que está acessível
console.log('\n🔍 Verificando acesso público de um arquivo…');
const sample = plan[0].filename;
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${sample}`;
const checkRes = await fetch(publicUrl);
if (checkRes.ok) {
  console.log(`   ✓ ${publicUrl} → ${checkRes.status}`);
  console.log('\n🎉 Tudo pronto. Site atualizado no Supabase Storage.');
} else {
  console.error(`   ✗ ${publicUrl} → ${checkRes.status} ${checkRes.statusText}`);
  console.error('   Bucket pode não estar marcado como público. Veja a migration.');
  process.exit(1);
}
