import mercadopago from "../../lib/mercadopago.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const body = req.body;

    if (body.type !== "payment") {
      return res.status(200).end();
    }

    const paymentId = body.data.id;

    const payment = await mercadopago.payment.findById(paymentId);

    const dados = payment.body;

    const status = dados.status;
    const externalReference = dados.external_reference;

    if (!externalReference) {
      console.error("Pagamento sem external_reference");
      return res.status(200).end();
    }

    let statusPedido = "aguardando_pagamento";
    let paidAt = null;
    let cancelledAt = null;

    if (status === "approved") {
      statusPedido = "novo";
      paidAt = new Date().toISOString();
    }

    if (status === "cancelled" || status === "rejected") {
      statusPedido = "cancelado";
      cancelledAt = new Date().toISOString();
    }

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${externalReference}`,
      {
        method: "PATCH",
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          status_pagamento: status,
          status_pedido: statusPedido,
          mp_payment_id: String(paymentId),
          paid_at: paidAt,
          cancelled_at: cancelledAt
        })
      }
    );

    const data = await response.json();

    console.log("Pedido atualizado:", data);

    return res.status(200).end();

  } catch (err) {
    console.error("Erro webhook:", err);
    return res.status(500).end();
  }
}
