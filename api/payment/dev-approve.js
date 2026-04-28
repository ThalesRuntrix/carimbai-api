import {
    processarPagamentoAprovado
} from "../../lib/processarPagamentoAprovado.js";

export default async function handler(req, res) {

    res.setHeader(
        "Access-Control-Allow-Origin",
        "https://runtrix.com.br"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST,OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Método inválido"
        });
    }

    try {

        const { pedido_id } = req.body;

        if (!pedido_id) {
            return res.status(400).json({
                error: "pedido_id obrigatório"
            });
        }

        await processarPagamentoAprovado({
            pedido_id,
            mp_payment_id:
                "PIX_TESTE_" + Date.now()
        });

        return res.status(200).json({
            success: true
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({
            error: "Erro interno"
        });

    }
}