import { enviarTelegram } from "./telegram.js";

export async function processarPagamentoAprovado({
  pedido_id,
  payment
}) {

    await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}`,
        {
            method: "PATCH",
            headers: {
                apikey: process.env.SUPABASE_KEY,
                Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status_pagamento: "approved",
                status_pedido: "producao",
                mp_payment_id: String(payment.id),
                external_reference: payment.external_reference,
                mp_status: payment.status,
                mp_status_detail: payment.status_detail,
                mp_payment_type: payment.payment_type_id,
                mp_payment_method: payment.payment_method_id,
                mp_date_approved: payment.date_approved || new Date().toISOString(),
                paid_at: new Date().toISOString()
            })
        }
    );

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

    if (!pedido?.whatsapp) {
        console.warn("Não foi localizado o numero do WhatsApp no pedido");        
    }

    console.log("Vai chamar enviarTelegram de dentro do processarPagamentoAprovado")
    await enviarTelegram(`
    🔥 <b>NOVO PEDIDO APROVADO</b>

    🧾 Pedido: <b>${pedido.pedido_codigo}</b>
    💰 Valor: R$ ${pedido.total}
    👤 Cliente: ${pedido.clientes?.nome || "N/A"}
    📱 WhatsApp: ${pedido.whatsapp || "N/A"}

    🚀 Status: EM PRODUÇÃO
    `);

    

}
