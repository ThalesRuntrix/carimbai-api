import client from "../../lib/mercadoPago.js";
import { Payment } from "mercadopago";

const paymentApi = new Payment(client);

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    // Mercado Pago envia vários tipos de notificação
    if (body.type !== "payment") {
      return res.status(200).json({ ok: true });
    }

    const paymentId = body.data?.id;

    if (!paymentId) {
      return res.status(200).json({ ok: true });
    }

    // Busca pagamento completo no Mercado Pago
    const payment = await paymentApi.get({
      id: paymentId
    });

    const dados = payment;

    const status = dados.status; // pending, approved, rejected...
    const pedidoId = dados.external_reference;

    if (!pedidoId) {
      console.log("Pagamento sem external_reference");
      return res.status(200).json({ ok: true });
    }

    // Status padrão
    let statusPagamento = status;
    let statusPedido = "aguardando_pagamento";

    let paidAt = null;
    let cancelledAt = null;

    // Regras de negócio
    if (status === "approved") {
      statusPedido = "novo";
      paidAt = new Date().toISOString();
    }

    if (
      status === "rejected" ||
      status === "cancelled" ||
      status === "refunded" ||
      status === "charged_back"
    ) {
      statusPedido = "cancelado";
      cancelledAt = new Date().toISOString();
    }

    if (
      status === "authorized" ||
      status === "in_process" ||
      status === "in_mediation"
    ) {
      statusPedido = "aguardando_pagamento";
    }

    // Atualiza pedido no Supabase
    const updateUrl =
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}`;

    const updateResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        status_pagamento: statusPagamento,
        status_pedido: statusPedido,
        mp_payment_id: String(paymentId),
        paid_at: paidAt,
        cancelled_at: cancelledAt
      })
    });

    const resultado = await updateResponse.json();

    console.log("Pedido atualizado:", resultado);

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("Erro webhook:", err);
    return res.status(500).json({ error: "Erro webhook" });
  }
}