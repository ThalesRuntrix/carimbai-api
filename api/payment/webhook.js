import client from "../../lib/mercadoPago.js";
import { Payment } from "mercadopago";

const paymentApi = new Payment(client);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const body = req.body;

    if (body.type !== "payment") {
      return res.status(200).end();
    }

    const payment = await paymentApi.get({
      id: body.data.id
    });

    console.log(payment);

    return res.status(200).end();

  } catch (err) {
    console.error(err);
    return res.status(500).end();
  }
}
