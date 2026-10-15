import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

// MarkdownV2 escaping
function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
function escUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const {
      type,
      label,
      amount,
      recipient_label,
      iban,
      category,
      comments,
      due_date,
      invoice_id,
      invoice_number,
      file_path,
      new_recipient,
    } = await req.json();

    // Generate signed URL for the uploaded file
    let fileUrl: string | null = null;
    if (file_path) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: signed } = await supabase.storage
        .from("invoices")
        .createSignedUrl(file_path, 60 * 60 * 24 * 365); // 1 year
      if (signed?.signedUrl) fileUrl = signed.signedUrl;
    }

    const isDefraiement = type === "defraiement";
    const dateLabel = isDefraiement ? "Date du paiement" : "Échéance";
    const titleLabel = isDefraiement
      ? "Nouvelle demande de défraiement"
      : "Nouvelle demande de virement";

    // Format date DD/MM/YYYY
    let echeanceStr = "—";
    if (due_date) {
      const d = new Date(due_date);
      echeanceStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    }

    // Format amount
    const amountStr = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

    const titleText = fileUrl
      ? `[*${esc(titleLabel)}*](${escUrl(fileUrl)})`
      : `*${esc(titleLabel)}*`;

    const dateLine = due_date
      ? `  ·  📅 ${esc(echeanceStr)}`
      : "";

    const text =
      `⏳ ${titleText}\n\n` +
      `📄 ${esc(label)}\n` +
      `💶 \`${esc(amountStr)} €\`${dateLine}\n\n` +
      `👤 \`${esc(recipient_label)}\`\n` +
      (category ? `${esc(category)}\n` : ``) +
      (new_recipient ? `🏦 \`${iban}\`\n\n` : `\n`) +
      (comments ? `💬 _${esc(comments)}_\n\n` : ``) +
      `🔖 \`${esc(invoice_number)}\` · *En attente*`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "✅ Marquer comme effectué",
            callback_data: `set_${invoice_id}_done`,
          },
        ],
      ],
    };

    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
          ...(fileUrl ? { link_preview_options: { url: fileUrl, show_above_text: false } } : {}),
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram API error: ${err}`);
    }

    // Store message_id so we can edit it later on toggle
    const tgResult = await res.json();
    const messageId = tgResult.result?.message_id;
    if (messageId && invoice_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // Store telegram message_id on the invoice for later editing
      await supabase
        .from("invoices")
        .update({ telegram_message_id: messageId })
        .eq("id", invoice_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
