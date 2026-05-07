import { enviarTelegram } from "../../lib/telegram.js";

export default async function handler(req, res) {

  // =========================
  // BLOQUEIA NÃO POST
  // =========================
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    // =========================
    // VALIDA HEADER SECRETO 
    // =========================
    const secret = req.headers["x-telegram-bot-api-secret-token"];

    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn("❌ Webhook inválido (secret_token)");
      return res.status(401).json({ ok: false });
    }

    const body = req.body;

    console.log("📩 Update recebido", JSON.stringify(body));

    // =========================
    // CALLBACK (BOTÕES)
    // =========================
    if (body?.callback_query) {

    const chatId = String(body.callback_query.message.chat.id);
    const data = body.callback_query.data;

    console.log("🔘 Callback recebido:", data);

    if (chatId !== process.env.TELEGRAM_CHAT_ID) {
        console.warn("🚫 Chat não autorizado:", chatId);
        return res.status(200).json({ ok: true });
    }

    // responde callback (remove loading do botão)
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: body.callback_query.id
        })
      }
    );

    // ação: marcar como produzido
    if (data.startsWith("produzido:")) {
        const pedidoId = data.split(":")[1];

        await marcarComoProduzido(chatId, pedidoId);
    }

    return res.status(200).json({ ok: true });
    }

    // =====================================
    // 💬 MENSAGENS
    // =====================================
    if (!body?.message) {
        return res.status(200).json({ ok: true });
    }

    const chatId = String(body.message.chat.id);
    const text = body.message.text?.trim();

    // =========================
    // VALIDA CHAT AUTORIZADO
    // =========================
    if (chatId !== process.env.TELEGRAM_CHAT_ID) {
      console.warn("🚫 Chat não autorizado:", chatId);
      return res.status(200).json({ ok: true });
    }

    // =========================
    // IGNORA MENSAGENS SEM TEXTO
    // =========================
    if (!text) {
      return res.status(200).json({ ok: true });
    }

    // =========================
    // PARSER DE COMANDOS
    // =========================
    const [command, ...args] = text.split(" ");

    const commands = {
      "/pedidos": () => responderPedidos(chatId),
      "/produzido": () => marcarComoProduzido(chatId, args[0]),
    };

    if (commands[command]) {
      await commands[command]();
    } else {
      await enviarTelegram({
        mensagem: "❓ Comando não reconhecido"
      });
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("🔥 Erro webhook Telegram:", error);
    return res.status(200).json({ ok: true });
  }
}


// =========================
// 📦 LISTAR PEDIDOS
// =========================
async function responderPedidos(chatId) {
  try {

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
      return enviarTelegram({
        mensagem: "📭 Nenhum pedido em produção"
      });
    }

    let msg = "📦 *Pedidos em produção:*\n\n";

    for (const p of pedidos) {
      msg += `📌 ID: ${p.id}\n`;
      msg += `Código: ${p.pedido_codigo}\n`;
      msg += `Valor: R$ ${p.total}\n\n`;
    }

    msg += "Use: /produzido ID";

    await enviarTelegram({ mensagem: msg });

  } catch (error) {
    console.error("Erro responderPedidos:", error);
    await enviarTelegram({ mensagem: "❌ Erro interno" });
  }
}

// =========================
// 🏭 MARCAR COMO PRODUZIDO
// =========================
async function marcarComoProduzido(chatId, pedidoId) {

  try {

    const id = Number(pedidoId);

    if (!id || isNaN(id)) {
      return enviarTelegram({ mensagem: "❌ ID inválido" });
    }

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          status_pedido: "pronto"
        })
      }
    );

    const result = await response.json();

    console.log("📝 UPDATE STATUS:", response.status);
    console.log("📝 UPDATE RESPONSE:", result);

    if (!response.ok || !result.length) {
      console.error("Erro ao atualizar pedido");
      return enviarTelegram({
        mensagem: "❌ Erro ao atualizar pedido"
      });
    }

    await enviarTelegram({
      mensagem: `✅ Pedido ${id} marcado como produzido`
    });

  } catch (error) {
    console.error("Erro marcarComoProduzido:", error);
    await enviarTelegram({
      mensagem: "❌ Erro interno"
    });
  }
}
