import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

function esc(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}
function escUrl(url: string): string {
  return url.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  try {
    const update = await req.json();
    const cb = update.callback_query;
    if (!cb) return new Response("ok", { status: 200 });

    const data = String(cb.data);
    const match = data.match(/^set_(.+)_(done|pending)$/);
    if (!match) return new Response("ok", { status: 200 });

    const invoiceId = match[1];
    const targetSent = match[2] === "done";

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update sent status
    const { error: updateErr } = await supabase
      .from("invoices")
      .update({ sent: targetSent })
      .eq("id", invoiceId);

    if (updateErr) throw new Error(`DB update error: ${updateErr.message}`);

    // Fetch full invoice + recipient for message rebuild
    const { data: invoice, error: fetchErr } = await supabase
      .from("invoices")
      .select("*, recipients(*)")
      .eq("id", invoiceId)
      .single();

    if (fetchErr || !invoice) throw new Error("Invoice not found");

    const recipient = invoice.recipients;
    const isSent = invoice.sent;
    const statusIcon = isSent ? "✅" : "⏳";
    const statusLabel = isSent ? "Effectué" : "En attente";

    // Determine type from due_date context (if date is in the past = défraiement)
    // We don't store type directly, so we check if label hints at it
    // For simplicity, use the same "virement" label
    const dateLabel = "Échéance";
    const titleLabel = "Nouvelle demande de virement";

    // Format date
    let echeanceStr = "—";
    if (invoice.due_date) {
      const d = new Date(invoice.due_date);
      echeanceStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    }

    // Format amount
    const amountStr = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(invoice.amount);

    // File URL — use file_path stored on the invoice
    let fileUrl: string | null = null;
    if (invoice.file_path) {
      const { data: signed } = await supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.file_path, 60 * 60 * 24 * 365);
      if (signed?.signedUrl) fileUrl = signed.signedUrl;
    }

    const titleText = fileUrl
      ? `[*${esc(titleLabel)}*](${escUrl(fileUrl)})`
      : `*${esc(titleLabel)}*`;

    const dateLine = invoice.due_date
      ? `  ·  📅 ${esc(echeanceStr)}`
      : "";

    const text =
      `${statusIcon} ${titleText}\n\n` +
      `📄 ${esc(invoice.label)}\n` +
      `💶 \`${esc(amountStr)} €\`${dateLine}\n\n` +
      `👤 \`${esc(recipient.recipient_label)}\`\n` +
      `🏦 \`${recipient.iban}\`\n\n` +
      `🔖 \`${esc(invoice.invoice_number || invoiceId)}\` · *${esc(statusLabel)}*`;

    // Flip button to opposite action
    const nextTarget = isSent ? "pending" : "done";
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: isSent
              ? "↩️ Marquer comme non effectué"
              : "✅ Marquer comme effectué",
            callback_data: `set_${invoiceId}_${nextTarget}`,
          },
        ],
      ],
    };

    // Edit the message
    await fetch(`${API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        text,
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      }),
    });

    // Answer the callback
    await fetch(`${API}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: cb.id,
        text: isSent ? "Marqué comme effectué" : "Marqué comme en attente",
      }),
    });

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("ok", { status: 200 }); // Always 200 so Telegram doesn't retry
  }
});
