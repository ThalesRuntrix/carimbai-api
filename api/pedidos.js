import { supabase } from "../lib/supabase";
import { formatarPedidoPayload } from "./util/formarPedido";

function send(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.status(status).json(data);
}

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    return send(res, 200, {});
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Método não permitido" });
  }

  try {
    const payload = formatarPedidoPayload(req.body);
    console.warn("PAYLOAD: ", payload);

    const { cliente, endereco, itens, pagamento, frete, prazo, entrega } = payload;

    let total = itens.reduce((acc, item) => acc + item.subtotal, 0);
    if (pagamento === "pix") {
      total = total * 0.9;
    }

    // ============================
    // 🔥 TRANSAÇÃO
    // ============================
    const { data, error } = await supabase.rpc("executar_transacao_pedido", {
      payload
    });

    if (error) {
      console.error(error);
      return send(res, 500, { error: "Erro ao processar pedido" });
    }

    return send(res, 200, data);

  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "Erro interno" });
  }
}