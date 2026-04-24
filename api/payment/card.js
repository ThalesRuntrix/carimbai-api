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

    // Busca pedido + cliente
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

    const preference = await preferenceApi.create({
      body: {
        external_reference: String(pedido.id),

        items: [
          {
            id: String(pedido.id),
            title: `Pedido ${pedido.pedido_codigo}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: Number(pedido.total)
          }
        ],

        payer: {
          email: cliente.email || "test_user_xxxxx@testuser.com",
          first_name: cliente.nome?.split(" ")[0] || "Cliente",
          last_name: cliente.nome?.split(" ").slice(1).join(" ") || "Teste",
          identification: {
            type: "CPF",
            number: cliente.cpf || "19119119100"
          }
        },

        payment_methods: {
          installments: 12
        },

        notification_url:
          "https://carimbai-api.vercel.app/api/payment/webhook",

        back_urls: {
          success: "https://runtrix.com.br/carimbai/pagamento/sucesso",
          failure: "https://runtrix.com.br/carimbai/pagamento/erro",
          pending: "https://runtrix.com.br/carimbai/pagamento/pendente"
        },

        auto_return: "approved"
      }
    });

    // salva no banco
    await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido.id}`,
      {
        method: "PATCH",
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mp_preference_id: preference.id,
          external_reference: String(pedido.id)
        })
      }
    );

    return res.status(200).json({
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Erro cartão"
    });
  }
}
