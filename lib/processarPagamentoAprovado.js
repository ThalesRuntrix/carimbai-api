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

    //Busca Pedido
    const busca = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=*`,
        {
            headers: {
                apikey: process.env.SUPABASE_KEY,
                Authorization: `Bearer ${process.env.SUPABASE_KEY}`
            }
        }
    );
    const pedidos = await busca.json();
    const pedido = pedidos[0];    

    //Busca Itens do Pedido
    const itensRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/pedido_itens?pedido_id=eq.${pedido.id}&select=*`,
        {
            headers: {
            apikey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_KEY}`
            }
        }
    );
    const itens = await itensRes.json();

    //Busca Produtos dos Itens
    const ids = itens.map(i => i.produto_id).join(",");
    const produtosRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/produtos?id=in.(${ids})&select=id,nome`,
        {
            headers: {
            apikey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_KEY}`
            }
        }
    );
    const produtos = await produtosRes.json();

    //Mapeia Produtos
    const produtosMap = {};
    for (const p of produtos) {
        produtosMap[p.id] = p;
    }

    const itensFormatados = itens.map(item => ({
        ...item,
        produto: produtosMap[item.produto_id]
    }));
    
    await enviarTelegram({
        mensagem: montarMensagemPedido(pedido, itensFormatados),
        botoes: [
            [
            {
                text: "✅ Marcar como produzido",
                callback_data: `produzido:${pedido.id}`
            }
            ]
        ]
    });

    

}

function montarMensagemPedido(pedido, itensFormatados) {
    console.log("Itens Formatados: ", itensFormatados)
  const itensTexto = (itensFormatados || [])
    .map((i) => {
      const nome = i.produtos?.nome || "Produto";
      return `• ${i.quantidade}x ${nome} - R$ ${i.subtotal}`;
    })
    .join("\n");

  return `
🔥 <b>NOVO PEDIDO APROVADO</b>

🧾 <b>${pedido.pedido_codigo}</b>
💰 R$ ${pedido.total.toFixed(2)}

👤 ${pedido.nome_cliente}
📱 ${pedido.whatsapp}

📦 <b>Itens:</b>
${itensTexto}

📍 <b>Endereço:</b>
${pedido.rua}, ${pedido.numero}
${pedido.bairro} - ${pedido.cidade}/${pedido.estado}

🚚 ${pedido.transportadora || "Retirada"}

🚀 <b>Status: EM PRODUÇÃO</b>
`;
}

