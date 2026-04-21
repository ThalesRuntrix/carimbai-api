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
    const { pedido_id } = req.body;

    if (!pedido_id) {
      return res.status(400).json({
        error: "pedido_id obrigatório"
      });
    }

    // 🔥 busca pedido + cliente
    const url =
      `${process.env.SUPABASE_URL}/rest/v1/pedidos` +
      `?id=eq.${pedido_id}` +
      `&select=*,clientes(*)`;

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    });

    const data = await response.json();

    const pedido = data[0];

    if (!pedido) {
      return res.status(404).json({
        error: "Pedido não encontrado"
      });
    }

    const cliente = pedido.clientes || {};

    const payment = await paymentApi.create({
      body: {
        transaction_amount: Number(pedido.total),

        description:
          `Pedido ${pedido.pedido_codigo}`,

        payment_method_id: "pix",

        external_reference:
          String(pedido.id),

        notification_url:
          "https://carimbai-api.vercel.app/api/payment/webhook",

        payer: {
          email:
            cliente.email ||
            "cliente@email.com",

          first_name:
            cliente.nome || "Cliente"
        }
      }
    });

    // 🔥 salvar no pedido
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization:
            `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mp_payment_id: String(payment.id),
          external_reference: String(pedido.id),
          pix_codigo:
            payment.point_of_interaction
              .transaction_data.qr_code,

          pix_qr_code:
            payment.point_of_interaction
              .transaction_data.qr_code_base64
        })
      }
    );

    return res.status(200).json({
      payment_id: payment.id,

      qr_code:
        payment.point_of_interaction
          .transaction_data.qr_code,

      qr_code_base64:
        payment.point_of_interaction
          .transaction_data.qr_code_base64
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Erro ao gerar PIX"
    });
  }
}
