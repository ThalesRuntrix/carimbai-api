import { enviarTelegram } from "../../lib/telegram";

export default async function handler(req, res) {

  // =========================
  // BLOQUEIA NÃO POST
  // =========================
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    // =========================
    // VALIDA TOKEN SECRETO
    // =========================
    const token = req.query.token;

    if (token !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn("Webhook Telegram inválido (token)");
      return res.status(401).json({ ok: false });
    }

    const body = req.body;

    console.log("📩 Telegram Update:", body);

    // =========================
    // VALIDA ESTRUTURA
    // =========================
    if (!body?.message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = body.message.chat.id;
    const text = body.message.text;

    // =========================
    // VALIDA CHAT AUTORIZADO
    // =========================
    if (String(chatId) !== process.env.TELEGRAM_CHAT_ID) {
      console.warn("Chat não autorizado:", chatId);
      return res.status(200).json({ ok: true });
    }

    // =========================
    // COMANDOS
    // =========================
    if (text === "/pedidos") {
      await responderPedidos(chatId);
    }

    if (text?.startsWith("/produzido")) {
      const pedidoId = text.split(" ")[1];
      await marcarComoProduzido(chatId, pedidoId);
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Erro webhook Telegram:", error);
    return res.status(200).json({ ok: true });
  }
}

async function responderPedidos(chatId) {

  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/pedidos?status_pedido=eq.producao&select=id,pedido_codigo,total`,
    {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    }
  );

  const pedidos = await response.json();

  if (!pedidos.length) {
    return enviarTelegram(chatId, "📭 Nenhum pedido em produção");
  }

  let msg = "📦 Pedidos em produção:\n\n";

  for (const p of pedidos) {
    msg += `#${p.id} - ${p.pedido_codigo} - R$ ${p.total}\n`;
  }

  msg += "\nUse: /produzido ID";

  await enviarTelegram(chatId, msg);
}

async function marcarComoProduzido(chatId, pedidoId) {

  if (!pedidoId) {
    return enviarTelegram(chatId, "❌ Informe o ID do pedido");
  }

  await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status_pedido: "enviado"
      })
    }
  );

  
  await enviarTelegram(chatId, `✅ Pedido ${pedidoId} marcado como produzido`);
}


