export async function processarPagamentoAprovado({
  pedido_id,
  payment
}) {

    //LOG 1
    console.log("1 entrou processarPagamentoAprovado");

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
                status_pedido: "novo",
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

    //LOG 1
    console.log("2 buscou pedido");

    const pedidos = await busca.json();
    const pedido = pedidos[0];

    //LOG 3
    console.log("3 pedido:", pedido);

    if (!pedido?.whatsapp) {
        //LOG 4
        console.log("4 sem whatsapp");
        return;
    }

    //LOG 5
    console.log("5 vai chamar send");

    await fetch(
        "https://carimbai-api.vercel.app/api/whatsapp/send",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                telefone: pedido.whatsapp,
                nome: pedido.clientes?.nome || "Cliente",
                pedido_codigo: pedido.pedido_codigo
            })
        }
    );

    //LOG 6
    console.log("6 retorno send:", resp.status);
}
