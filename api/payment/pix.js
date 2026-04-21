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
    const { produtoId } = req.body;

    // 🔥 BUSCAR DO BANCO (igual no produtos.js)
    const produto = {
      id: produtoId,
      nome: "Carimbo Personalizado",
      preco: 29.9
    };

    const payment = await mercadopago.payment.create({
      transaction_amount: produto.preco,
      description: produto.nome,
      payment_method_id: "pix",
      notification_url: "https://SEU-DOMINIO/api/payment/webhook"
    });

    return res.status(200).json({
      qr_code_base64:
        payment.body.point_of_interaction.transaction_data.qr_code_base64,
      payment_id: payment.body.id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar PIX" });
  }
}