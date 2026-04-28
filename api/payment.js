import client from "../lib/mercadoPago.js";
import { Payment } from "mercadopago";
import { processarPagamentoAprovado } from "../lib/processarPagamentoAprovado.js";

const paymentApi = new Payment(client);

export default async function handler(req, res) {
    // =========================
    // CORS
    // =========================
    res.setHeader(
        "Access-Control-Allow-Origin",
        "https://runtrix.com.br"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const action = req.query.action;

    try {
        switch (action) {
            case "pix":
                return await gerarPix(req, res);

            case "card":
                return await pagarCartao(req, res);

            case "webhook":
                return await webhook(req, res);

            case "dev-approve":
                return await devApprove(req, res);

            case "satus":
                return await getPaymentStatus(req, res);

            default:
                return res.status(404).json({
                    error: "Ação inválida"
                });
        }
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Erro interno"
        });
    }
}

// =====================================================
// STATUS
// =====================================================
async function getPaymentStatus(req, res) {
    const { pedido_id } = req.body;
    const busca = await fetch(
     `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=status_pagamento`
   );

   const rows = await busca.json();

   return res.status(200).json(rows[0]);
}

// =====================================================
// PIX
// =====================================================
async function gerarPix(req, res) {
    const { pedido_id } = req.body;

    if (!pedido_id) {
        return res.status(400).json({
            error: "pedido_id obrigatório"
        });
    }

    const pedido = await buscarPedido(pedido_id);

    if (!pedido) {
        return res.status(404).json({
            error: "Pedido não encontrado"
        });
    }

    const cliente = pedido.clientes || {};

    const payment = await paymentApi.create({
        body: {
            transaction_amount: Number(pedido.total),

            description:
                `Pedido ${pedido.pedido_codigo}`,

            payment_method_id: "pix",

            external_reference:
                String(pedido.id),

            notification_url:
                "https://carimbai-api.vercel.app/api/payment?action=webhook",

            payer: montarPayer(cliente)
        }
    });

    const qr =
        payment.point_of_interaction
            .transaction_data;

    await atualizarPedido(pedido.id, {
        mp_payment_id: String(payment.id),
        pix_codigo: qr.qr_code,
        pix_qr_code: qr.qr_code_base64
    });

    return res.status(200).json({
        payment_id: payment.id,
        qr_code: qr.qr_code,
        qr_code_base64: qr.qr_code_base64
    });
}

// =====================================================
// CARTÃO BRICKS
// =====================================================
async function pagarCartao(req, res) {
    const { pedido_id, formData } = req.body;

    const {
        token,
        issuer_id,
        payment_method_id,
        installments
    } = formData || {};

    if (!pedido_id || !token) {
        return res.status(400).json({
            error: "Dados inválidos"
        });
    }

    const pedido = await buscarPedido(pedido_id);

    if (!pedido) {
        return res.status(404).json({
            error: "Pedido não encontrado"
        });
    }

    const cliente = pedido.clientes || {};

    const payment = await paymentApi.create({
        body: {
            transaction_amount:
                Number(pedido.total),

            token,
            issuer_id,
            payment_method_id,

            installments:
                Number(installments),

            external_reference:
                String(pedido.id),

            notification_url:
                "https://carimbai-api.vercel.app/api/payment?action=webhook",

            payer: montarPayer(cliente)
        }
    });

    await atualizarPedido(pedido.id, {
        mp_payment_id: String(payment.id),
        status_pagamento:
            payment.status
    });

    return res.status(200).json({
        success: true,
        id: payment.id,
        status: payment.status
    });
}

// =====================================================
// WEBHOOK REAL
// =====================================================
async function webhook(req, res) {
    const body = req.body;

    if (body.type !== "payment") {
        return res.status(200).json({
            ok: true
        });
    }

    const paymentId =
        body.data?.id;

    if (!paymentId) {
        return res.status(200).json({
            ok: true
        });
    }

    const payment =
        await paymentApi.get({
            id: paymentId
        });

    const status =
        payment.status;

    const pedidoId =
        payment.external_reference;

    if (!pedidoId) {
        return res.status(200).json({
            ok: true
        });
    }

    if (status === "approved") {
        await processarPagamentoAprovado({
            pedido_id: pedidoId,
            mp_payment_id: paymentId
        });
    } else {
        await atualizarPedido(
            pedidoId,
            {
                status_pagamento:
                    status
            }
        );
    }

    return res.status(200).json({
        ok: true
    });
}

// =====================================================
// DEV APPROVE
// =====================================================
async function devApprove(req, res) {
    const { pedido_id } = req.body;

    if (!pedido_id) {
        return res.status(400).json({
            error:
                "pedido_id obrigatório"
        });
    }

    await processarPagamentoAprovado({
        pedido_id,
        mp_payment_id:
            "DEV_" + Date.now()
    });

    return res.status(200).json({
        success: true
    });
}

// =====================================================
// HELPERS
// =====================================================
async function buscarPedido(
    pedido_id
) {
    const response =
        await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=*,clientes(*)`,
            {
                headers: {
                    apikey:
                        process.env.SUPABASE_KEY,
                    Authorization:
                        `Bearer ${process.env.SUPABASE_KEY}`
                }
            }
        );

    const data =
        await response.json();

    return data[0];
}

async function atualizarPedido(
    id,
    body
) {
    await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}`,
        {
            method: "PATCH",
            headers: {
                apikey:
                    process.env.SUPABASE_KEY,
                Authorization:
                    `Bearer ${process.env.SUPABASE_KEY}`,
                "Content-Type":
                    "application/json"
            },
            body: JSON.stringify(body)
        }
    );
}

function montarPayer(
    cliente
) {
    return {
        email:
            cliente.email,

        first_name:
            cliente.nome
                ?.split(" ")[0] ||
            "Cliente",

        last_name:
            cliente.nome
                ?.split(" ")
                .slice(1)
                .join(" ") || "",

        identification: {
            type: "CPF",
            number:
                cliente.cpf
        }
    };
}
