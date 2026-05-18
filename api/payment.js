import client from "../lib/mercadoPago.js";
import { Payment } from "mercadopago";
import { processarPagamentoAprovado } from "../lib/processarPagamentoAprovado.js";

const rateLimitMap = new Map();
const paymentApi = new Payment(client);

function rateLimit(req, limit = 10, windowMs = 60000) {
    const ip =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.socket?.remoteAddress ||
        "unknown";

    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }

    const timestamps = rateLimitMap.get(ip);

    const recent = timestamps.filter(
        (t) => now - t < windowMs
    );

    if (recent.length >= limit) {
        return false;
    }

    recent.push(now);
    rateLimitMap.set(ip, recent);

    return true;
}


function validarOrigem(req) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    const permitido = "https://runtrix.com.br";

    if (
        (origin && origin.startsWith(permitido)) ||
        (referer && referer.startsWith(permitido))
    ) {
        return true;
    }

    return false;
}

export default async function handler(req, res) {

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    const action = req.query.action;

    try {

        // WEBHOOK NÃO PASSA POR VALIDAÇÃO DE ORIGEM
        if (action !== "webhook") {

            if (!validarOrigem(req)) {
                console.warn("Origem não permitida");
                return res.status(403).json({
                    error: "Forbidden"
                });
            }

        }

        // RATE LIMIT POR AÇÃO
        if (action === "card" || action === "pix") {
            if (!rateLimit(req, 5, 60000)) {
                return res.status(429).json({
                    error: "Muitas tentativas de pagamento"
                });
            }
        }

        if (action === "status") {
            if (!rateLimit(req, 5, 60000)) {
                return res.status(429).json({
                    error: "Muitas tentativas de consulta ao status"
                });
            }
        }

        switch (action) {
            case "pix":
                return await gerarPix(req, res);

            case "card":
                return await pagarCartao(req, res);

            case "webhook":
                return await webhook(req, res);

            case "status":
                return await getPaymentStatus(req, res);

            case "dev-approve-pix":
                return await devApprove(req, res);

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
// DEV APPROVE (TEST PIX)
// =====================================================
async function devApprove(req, res) {
    const { pedido_id } = req.body;

    if (!pedido_id) {
        return res.status(400).json({
            error:
                "pedido_id obrigatório"
        });
    }

    const pedido = await buscarPedido(pedido_id);

    if (!pedido) {
        return res.status(404).json({
            error: "Pedido não encontrado"
        });
    }

    if (pedido.status_pagamento === "approved") {
        return res.status(400).json({
            error: "Pedido já pago"
        });
    }

    await processarPagamentoAprovado({
        pedido_id,
        payment: {
            id: "DEV_" + Date.now(),
            external_reference: String(pedido.pedido_codigo),
            status: "approved",
            status_detail: "accredited",
            payment_type_id: "dev",
            payment_method_id: "dev",
            date_approved: new Date().toISOString()
        }
    });

    return res.status(200).json({
        success: true
    });
}

// =====================================================
// STATUS
// =====================================================
async function getPaymentStatus(req, res) {
    try {
        const pedido_id = req.query.pedido_id || req.body?.pedido_id;

        if (!pedido_id) {
            return res.status(400).json({
                error: "pedido_id obrigatório"
            });
        }

        const busca = await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(pedido_id)}&select=status_pagamento`,
            {
                headers: {
                    apikey: process.env.SUPABASE_KEY,
                    Authorization: `Bearer ${process.env.SUPABASE_KEY}`
                }
            }
        );

        const rows = await busca.json();

        if (!rows.length) {
            return res.status(404).json({
                error: "Pedido não encontrado"
            });
        }

        return res.status(200).json(rows[0]);

    } catch (error) {
        console.error("Erro getPaymentStatus:", error);

        return res.status(500).json({
            error: "Erro interno"
        });
    }
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

    if (pedido.status_pagamento === "approved") {
        return res.status(400).json({
            error: "Pedido já pago"
        });
    }

    const payment = await paymentApi.create({
        body: {
            transaction_amount: Number(pedido.total),

            description:
                `Pedido ${pedido.pedido_codigo}`,

            payment_method_id: "pix",

            external_reference:
                String(pedido.pedido_codigo),

            notification_url:
                "https://carimbai-api.vercel.app/api/payment?action=webhook",

            payer: montarPayer(pedido)
        }
    });

    const qr =
        payment.point_of_interaction
            .transaction_data;

    await atualizarPedido(pedido.id, {
        mp_payment_id: String(payment.id),
        external_reference: String(pedido.pedido_codigo),
        mp_status: payment.status,
        mp_status_detail: payment.status_detail,
        mp_payment_type: payment.payment_type_id,
        mp_payment_method: payment.payment_method_id,
        pix_codigo: qr.qr_code,
        pix_qr_code: qr.qr_code_base64,
        status_pagamento: "pending"
    });

    return res.status(200).json({
        success: true,
        payment_id: payment.id,
        status: payment.status,
        qr_code: qr.qr_code,
        qr_code_base64: qr.qr_code_base64
    });
    
}

// =====================================================
// CARTÃO BRICKS
// =====================================================
async function pagarCartao(req, res) {

    try {
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

        if (pedido.status_pagamento === "approved") {
            return res.status(400).json({
                error: "Pedido já pago"
            });
        }

        console.log("PEDIDO QUE VAI GERAR O PAYMENT NO MP: ", pedido);

        const paymentResponse = await paymentApi.create({
            body: {
                transaction_amount:
                    Number(Number(pedido.total).toFixed(2)),

                token,
                issuer_id,
                payment_method_id,

                installments:
                    Number(installments),

                external_reference:
                    String(pedido.pedido_codigo),

                notification_url:
                    "https://carimbai-api.vercel.app/api/payment?action=webhook",

                payer: montarPayer(pedido)
            }
        });

        const payment = paymentResponse.response || paymentResponse;

        console.log("PAYMENT GERADO NO MP: ", payment);

        await atualizarPedido(pedido.id, {
            mp_payment_id: String(payment.id),
            external_reference: String(pedido.pedido_codigo),
            mp_status: payment.status,
            mp_status_detail: payment.status_detail,
            mp_payment_type: payment.payment_type_id,
            mp_payment_method: payment.payment_method_id,
            status_pagamento: "pending"
        });

        return res.status(200).json({
            success: true,
            id: payment.id,
            status: payment.status
        });
    } catch (error) {
        console.error(
            "ERRO pagarCartao RAW:",
            error
        );

        console.error(
            "ERRO pagarCartao JSON:",
            JSON.stringify(error, null, 2)
        );

        if (error.cause) {
            console.error("CAUSE:", error.cause);
        }

        return res.status(500).json({
            error: true
        });
    }
}

// =====================================================
// WEBHOOK
// =====================================================
import crypto from "crypto";

async function webhook(req, res) {
    try {
        // =====================================
        // CONFIG
        // =====================================
        const SECRET =
            process.env.MP_WEBHOOK_SECRET;

        if (!SECRET) {
            console.error(
                "MP_WEBHOOK_SECRET não configurado"
            );

            return res.status(500).json({
                ok: false
            });
        }

        // =====================================
        // LOGS INICIAIS
        // =====================================
        if (process.env.NODE_ENV !== "production") {
            console.log(
            "WEBHOOK BODY:",
            req.body
            );

            console.log(
                "WEBHOOK HEADERS:",
                req.headers
            );
        }
        

        // =====================================
        // ASSINATURA HEADER
        // Mercado Pago envia:
        // x-signature:
        // ts=123456,v1=hash
        // =====================================
        const signature =
            req.headers["x-signature"];

        const requestId =
            req.headers["x-request-id"];

        if (!signature) {
            console.warn(
                "Webhook sem assinatura"
            );

            return res.status(401).json({
                ok: false
            });
        }

        // =====================================
        // Parse assinatura
        // =====================================
        const parts =
            signature.split(",");

        let ts = null;
        let hash = null;

        for (const item of parts) {
            const [k, v] =
                item.trim().split("=");

            if (k === "ts") ts = v;
            if (k === "v1") hash = v;
        }

        if (!ts || !hash) {
            console.warn(
                "Assinatura inválida"
            );

            return res.status(401).json({
                ok: false
            });
        }

        // =====================================
        // Anti replay (5 min)
        // =====================================
        const now =
            Math.floor(Date.now() / 1000);

        const diff =
            Math.abs(now - Number(ts));

        if (diff > 300) {
            console.warn(
                "Webhook expirado"
            );

            return res.status(401).json({
                ok: false
            });
        }

        // =====================================
        // PAYMENT ID
        // =====================================
        const paymentId =
            req.body?.data?.id ||
            req.query["data.id"] ||
            req.query.id;

        if (!paymentId) {
            return res.status(200).json({
                ok: true
            });
        }

        // =====================================
        // TEMPLATE OFICIAL MP
        // id:{data.id};request-id:{x-request-id};ts:{ts};
        // =====================================
        const manifest =
            `id:${paymentId};request-id:${requestId};ts:${ts};`;

        const generated =
            crypto
                .createHmac(
                    "sha256",
                    SECRET
                )
                .update(manifest)
                .digest("hex");

        // =====================================
        // Compare seguro
        // =====================================
        const valid =
            crypto.timingSafeEqual(
                Buffer.from(generated),
                Buffer.from(hash)
            );

        if (!valid) {
            console.warn(
                "Assinatura inválida"
            );

            return res.status(401).json({
                ok: false
            });
        }

        // =====================================
        // Tipo evento
        // =====================================
        const eventType =
            req.body?.type ||
            req.query.type;

        if (eventType !== "payment") {
            return res.status(200).json({
                ok: true
            });
        }

        // =====================================
        // Busca pagamento oficial MP
        // =====================================
        const response =
            await paymentApi.get({
                id: paymentId
            });

        const payment =
            response.response ||
            response;

        const status =
            payment.status;

        const pedidoCodigo =
            payment.external_reference;

        if (!pedidoCodigo) {
            return res.status(200).json({
                ok: true
            });
        }

        // =====================================
        // Busca pedido interno
        // =====================================
        const pedido =
            await buscarPedidoPorCodigo(
                pedidoCodigo
            );

        if (!pedido) {
            return res.status(200).json({
                ok: true
            });
        }

        // =====================================
        // Validação valor
        // =====================================
        if (
            Number(
                payment.transaction_amount
            ) !==
            Number(pedido.total)
        ) {
            console.error(
                "Valor divergente"
            );

            return res.status(200).json({
                ok: true
            });
        }

        // =====================================
        // IDEMPOTÊNCIA
        // =====================================
        if (
            pedido.paid_at &&
            String(
                pedido.mp_payment_id
            ) ===
                String(payment.id)
        ) {
            console.warn(
                "Webhook duplicado"
            );

            return res.status(200).json({
                ok: true
            });
        }

        // =====================================
        // APPROVED
        // =====================================
        if (status === "approved") {
            await processarPagamentoAprovado({
                pedido_id: pedido.id,
                payment
            });

            return res.status(200).json({
                ok: true,
                processed: true
            });
        }

        // =====================================
        // OUTROS STATUS
        // =====================================
        await atualizarPedido(
            pedido.id,
            {
                status_pagamento:
                    status,
                mp_payment_id:
                    String(payment.id),
                external_reference:
                    payment.external_reference,
                mp_status:
                    payment.status,
                mp_status_detail:
                    payment.status_detail,
                mp_payment_type:
                    payment.payment_type_id,
                mp_payment_method:
                    payment.payment_method_id
            }
        );

        return res.status(200).json({
            ok: true,
            updated: true
        });

    } catch (error) {
        console.error(
            "ERRO WEBHOOK:",
            error?.stack || error
        );

        return res.status(200).json({
            ok: true
        });
    }
}

// =====================================================
// HELPERS
// =====================================================
async function buscarPedido(
    pedido_id
) {
    const response =
        await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=*`,
            {
                headers: {
                    apikey:
                        process.env.SUPABASE_KEY,
                    Authorization:
                        `Bearer ${process.env.SUPABASE_KEY}`
                }
            }
        );

    const data = await response.json();
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

async function buscarPedidoPorCodigo(
    pedido_codigo
) {
    const codigo =
        encodeURIComponent(
            pedido_codigo
        );

    const response =
        await fetch(
            `${process.env.SUPABASE_URL}/rest/v1/pedidos?pedido_codigo=eq.${codigo}&select=*`,
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

function montarPayer(
    pedido
) {    
    return {
        email:
            pedido.email_cliente || "comprador@carimbai.com.br",

        first_name:
            pedido.nome_cliente
                ?.split(" ")[0] ||
            "Cliente",

        last_name:
            pedido.nome_cliente
                ?.split(" ")
                .slice(1)
                .join(" ") || "",

        identification: {
            type: "CPF",
            number:
                pedido.cpf_cliente?.replace(/\D/g, ""),
        }
    };
}
