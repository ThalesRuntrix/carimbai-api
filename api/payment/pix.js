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

  try {
    const pedido = req.body;

    const payment = await paymentApi.create({
      body: {
        transaction_amount: Number(pedido.total),
        description: `Pedido ${pedido.pedido_codigo}`,
        payment_method_id: "pix",

        payer: {
          email: pedido.email || "cliente@email.com"
        },

        external_reference: String(pedido.id),

        notification_url:
          "https://carimbai-api.vercel.app/api/payment/webhook"
      }
    });

    return res.status(200).json({
      payment_id: payment.id,
      qr_code:
        payment.point_of_interaction.transaction_data.qr_code,
      qr_code_base64:
        payment.point_of_interaction.transaction_data.qr_code_base64
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro PIX" });
  }
}
