import client from "../../lib/mercadoPago.js";
import { Preference } from "mercadopago";

const preferenceApi = new Preference(client);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const pedido = req.body;

    const preference = await preferenceApi.create({
      body: {
        items: [
          {
            title: `Pedido ${pedido.pedido_codigo}`,
            quantity: 1,
            unit_price: Number(pedido.total)
          }
        ],

        external_reference: String(pedido_id),

        notification_url:
          "https://carimbai-api.vercel.app/api/payment/webhook"
      }
    });

    return res.status(200).json({
      init_point: preference.init_point
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro cartão" });
  }
}
