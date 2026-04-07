import { formatarPedidoPayload } from "./util/formarPedido";

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // 🔥 1. Formatar payload
    const payload = formatarPedidoPayload(req.body);

    // 🔥 2. Chamar função no banco
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
      return res.status(500).json({ error: "Erro ao criar pedido" });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error("Erro geral:", err);
    return res.status(500).json({ error: "Erro interno" });
  }

}