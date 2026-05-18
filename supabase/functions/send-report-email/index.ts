// ============================================================
// send-report-email — Supabase Edge Function
//
// Recebe webhook do Postgres quando há INSERT em
// translation_reports_guia e envia email para mioshie567@gmail.com
// via Resend.
//
// Configuração:
//   1. Deploy: copia este arquivo em Dashboard → Edge Functions
//   2. Secret: Dashboard → Edge Functions → Secrets → adicionar
//      RESEND_API_KEY = re_xxxxxxxxxxxxxxxxx
//   3. Webhook: Dashboard → Database → Webhooks → Create:
//        - Table: translation_reports_guia
//        - Events: INSERT
//        - Type: Supabase Edge Functions
//        - Function: send-report-email
//        - Method: POST
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const TO_EMAIL = "mioshie567@gmail.com";

// Resend permite enviar a partir de "onboarding@resend.dev" sem
// verificar domínio — perfeito pra começar. Se quiser usar
// algo como "reportes@guiadojohrei.online", precisa verificar o
// domínio no Dashboard do Resend (instruções deles, ~10min).
const FROM_EMAIL = "Guia Johrei <onboarding@resend.dev>";

function fmtDateBR(iso: string | null): string {
  if (!iso) return "(data desconhecida)";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!RESEND_API_KEY) {
    return new Response("RESEND_API_KEY not configured", { status: 500 });
  }

  try {
    const payload = await req.json();
    // Database Webhook envia: { type, table, record, schema, old_record }
    const r = payload.record || payload;

    const title = r.article_title || r.article_id || "(sem título)";
    const subject = `[Guia Johrei] Reporte em "${title}"`;

    const textBody = [
      `📍 Ensinamento: ${title}`,
      `📂 Aba: ${r.tab || "(desconhecida)"}`,
      `🆔 ID: ${r.article_id || "(desconhecido)"}`,
      ``,
      `✂️ Trecho reportado:`,
      `"${r.selected_text || ""}"`,
      ``,
      `💬 Comentário do usuário:`,
      r.description ? `"${r.description}"` : "(sem comentário)",
      ``,
      `🔗 Abrir artigo:`,
      r.page_url || "(URL não capturada)",
      ``,
      `🕐 Recebido em: ${fmtDateBR(r.created_at)}`,
      ``,
      `—`,
      `Reporte ID: ${r.id || ""}`,
      `User Agent: ${(r.user_agent || "").slice(0, 200)}`,
    ].join("\n");

    const htmlBody = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;line-height:1.6">
  <h2 style="margin:0 0 4px;font-size:18px;color:#000">📥 Novo reporte de tradução</h2>
  <p style="margin:0 0 20px;color:#888;font-size:13px">Recebido em ${escapeHtml(fmtDateBR(r.created_at))}</p>

  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
    <tr><td style="padding:6px 0;color:#888;width:90px">Ensinamento</td><td style="padding:6px 0;font-weight:600">${escapeHtml(title)}</td></tr>
    <tr><td style="padding:6px 0;color:#888">Aba</td><td style="padding:6px 0">${escapeHtml(r.tab || "(desconhecida)")}</td></tr>
    <tr><td style="padding:6px 0;color:#888">ID</td><td style="padding:6px 0;font-family:monospace;font-size:12px">${escapeHtml(r.article_id || "")}</td></tr>
  </table>

  <div style="background:#fff8e6;border-left:3px solid #e6a23c;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:20px">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#a87a1b;font-weight:700;margin-bottom:6px">Trecho reportado</div>
    <div style="font-style:italic;font-size:15px;line-height:1.55">"${escapeHtml(r.selected_text || "")}"</div>
  </div>

  ${r.description ? `
  <div style="background:#f5f5f5;padding:14px 16px;border-radius:8px;margin-bottom:20px">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#777;font-weight:700;margin-bottom:6px">Comentário do usuário</div>
    <div style="font-size:14px">"${escapeHtml(r.description)}"</div>
  </div>` : ""}

  ${r.page_url ? `
  <p style="margin:0 0 20px"><a href="${escapeHtml(r.page_url)}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">🔗 Abrir artigo</a></p>` : ""}

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#aaa;font-size:11px;margin:0;font-family:monospace">
    Reporte ID: ${escapeHtml(r.id || "")}<br>
    User Agent: ${escapeHtml((r.user_agent || "").slice(0, 200))}
  </p>
</div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", res.status, errText);
      return new Response(`Resend error ${res.status}: ${errText}`, { status: 500 });
    }

    const result = await res.json();
    return new Response(JSON.stringify({ ok: true, resend_id: result.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Function error:", e);
    return new Response(`Error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
});
