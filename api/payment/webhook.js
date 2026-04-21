import mercadopago from "../../lib/mercadoPago.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const data = req.body;

    if (data.type === "payment") {
      const payment = await mercadopago.payment.findById(data.data.id);

      if (payment.body.status === "approved") {
        console.log("Pagamento aprovado!");

        // 🔥 atualizar pedido no banco aqui
      }
    }

    res.status(200).end();

  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
}