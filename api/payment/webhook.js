import client from "../../lib/mercadoPago.js";
import { Payment } from "mercadopago";

const paymentApi = new Payment(client);

export default async function handler(req, res) {

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

    if (body.type !== "payment") {
      return res.status(200).json({ ok: true });
    }

    const paymentId = body.data?.id;

    if (!paymentId) {
      return res.status(200).json({ ok: true });
    }

    const payment = await paymentApi.get({
      id: paymentId
    });

    const status = payment.status;
    const pedidoId = payment.external_reference;

    if (!pedidoId) {
      return res.status(200).json({ ok: true });
    }

    let statusPedido = "aguardando_pagamento";
    let paidAt = null;
    let cancelledAt = null;

    if (status === "approved") {
      statusPedido = "novo";
      paidAt = new Date().toISOString();
    }

    if (
      status === "rejected" ||
      status === "cancelled" ||
      status === "refunded"
    ) {
      statusPedido = "cancelado";
      cancelledAt = new Date().toISOString();
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
          status_pagamento: status,
          status_pedido: statusPedido,
          mp_payment_id: String(paymentId),
          paid_at: paidAt,
          cancelled_at: cancelledAt
        })
      }
    );

    // WHATSAPP AUTOMÁTICO
    if (status === "approved") {

      const busca = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}&select=*,clientes(*)`,
        {
          headers: {
            apikey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_KEY}`
          }
        }
      );

      const pedidos = await busca.json();
      const pedido = pedidos[0];

      if (pedido?.whatsapp) {

        await fetch(
          "https://carimbai-api.vercel.app/api/whatsapp/send",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              telefone: pedido.whatsapp,
              nome: pedido.clientes?.nome || "Cliente",
              pedido_codigo: pedido.pedido_codigo
            })
          }
        );

      }
    }

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro webhook"
    });
  }
}
