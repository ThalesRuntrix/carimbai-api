import { Payment } from "mercadopago";
import client from "../../lib/mercadoPago.js";

const paymentApi = new Payment(client);

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  console.log("BODY:", req.body);

  try {

    const {
      pedido_id,
      token,
      issuer_id,
      payment_method_id,
      installments
    } = req.body;

    if (!pedido_id) {
      return res.status(400).json({ error:"pedido_id ausente" });
    }

    if (!token) {
      return res.status(400).json({
        error:"token ausente",
        body:req.body
      });
    }

    // ==================================
    // BUSCA PEDIDO
    // ==================================
    const busca = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=*,clientes(*)`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );

   const pedidos = await busca.json();
    const pedido = pedidos[0];

    if(!pedido){
      return res.status(404).json({
        error:"Pedido não encontrado"
      });
    }

    if (pedido.status_pagamento === "approved") {
      return res.status(400).json({
        error: "Pedido já pago"
      });
    }

    const cliente = pedido.clientes || {};

    // ==================================
    // COBRANÇA MP
    // ==================================
    const payment = await paymentApi.create({
      body: {

        transaction_amount: Number(pedido.total),

        token,

        installments: Number(installments),

        payment_method_id,

        issuer_id,

        payer: {
          email: cliente.email,

          first_name:
            cliente.nome?.split(" ")[0] || "Cliente",

          last_name:
            cliente.nome?.split(" ").slice(1).join(" ") || "",

          identification: {
            type: "CPF",
            number: cliente.cpf
          }
        },

        external_reference: String(pedido.id),

        notification_url:
          "https://carimbai-api.vercel.app/api/payment/webhook"
      }
    });

    // ==================================
    // SALVA RETORNO INICIAL
    // ==================================
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
          mp_payment_id: String(payment.id),
          status_pagamento: payment.status
        })
      }
    );

    return res.status(200).json({
      success: true,
      id: payment.id,
      status: payment.status
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Erro ao processar pagamento"
    });
  }
}
