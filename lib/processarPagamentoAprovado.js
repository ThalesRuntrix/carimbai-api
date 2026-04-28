export async function processarPagamentoAprovado({
  pedido_id,
  mp_payment_id
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
        status_pedido: "novo",
        mp_payment_id: String(mp_payment_id),
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

  if (!pedido?.whatsapp) return;

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
}
