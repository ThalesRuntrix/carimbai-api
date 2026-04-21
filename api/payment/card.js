import mercadopago from "../../lib/mercadoPago.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { produtoId } = req.body;

    const produto = {
      id: produtoId,
      nome: "Carimbo Personalizado",
      preco: 29.9
    };

    const preference = await mercadopago.preferences.create({
      items: [
        {
          title: produto.nome,
          unit_price: produto.preco,
          quantity: 1
        }
      ],
      notification_url: "https://SEU-DOMINIO/api/payment/webhook"
    });

    return res.status(200).json({
      init_point: preference.body.init_point
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro no pagamento com cartão" });
  }
}