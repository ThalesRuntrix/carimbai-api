import mercadopago from "../../lib/mercadoPago.js";

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
    const pedido = req.body;

    const payment = await mercadopago.payment.create({
      transaction_amount: Number(pedido.valor_total),
      description: `Pedido #${pedido.pedido_codigo}`,
      payment_method_id: "pix",

      payer: {
        first_name: pedido.nome,
        email: pedido.email
      },

      external_reference: String(pedido.id),

      notification_url:
        "https://carimbai-api.vercel.app/api/payment/webhook"
    });

    return res.status(200).json({
      payment_id: payment.body.id,

      qr_code:
        payment.body.point_of_interaction.transaction_data.qr_code,

      qr_code_base64:
        payment.body.point_of_interaction.transaction_data.qr_code_base64
    });

  } catch (err) {
    console.error("Erro PIX:", err);
    res.status(500).json({ error: "Erro ao gerar PIX" });
  }
}
