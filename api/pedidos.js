import { formatarPedidoPayload } from "./util/formatarPedido.js";

function send(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  return res.status(status).json(data);
}

export default async function handler(req, res) {

  // 🔥 Preflight
  if (req.method === "OPTIONS") {
    return send(res, 200, {});
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Método não permitido" });
  }

  try {
    const payload = formatarPedidoPayload(req.body);

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/rpc/criar_pedido`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dados: payload,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro Supabase:", data);
      return send(res, 500, { error: "Erro ao criar pedido" });
    }

    return send(res, 200, data);

  } catch (err) {
    console.error("Erro geral:", err);
    return send(res, 500, { error: "Erro interno" });
  }
}