import mercadopago from "../../lib/mercadopago.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const pedido = req.body;

    const preference =
      await mercadopago.preferences.create({
        items: [
          {
            title: `Pedido ${pedido.pedido_codigo}`,
            quantity: 1,
            unit_price: Number(pedido.valor_total)
          }
        ],

        external_reference: String(pedido.id),

        notification_url:
          "https://carimbai-api.vercel.app/api/payment/webhook",

        back_urls: {
          success: "https://runtrix.com.br/sucesso",
          failure: "https://runtrix.com.br/falha",
          pending: "https://runtrix.com.br/pendente"
        },

        auto_return: "approved"
      });

    return res.status(200).json({
      init_point: preference.body.init_point
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Erro no cartão"
    });
  }
}
