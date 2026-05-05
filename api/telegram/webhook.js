export default async function handler(req, res) {
  const body = req.body;

  if (body.callback_query) {
    const data = body.callback_query.data;

    if (data.startsWith("produzido:")) {
      const pedidoId = data.split(":")[1];

      await marcarComoProduzido(pedidoId);
    }
  }

  if (body.message) {
    const texto = body.message.text;

    if (texto === "/pedidos") {
      await listarPedidos();
    }
  }

  return res.status(200).json({ ok: true });
}

async function marcarComoProduzido(pedidoId) {
  await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedidoId}`,
    {
      method: "PATCH",
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status_pedido: "enviado"
      })
    }
  );
}

async function listarPedidos() {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/pedidos?status_pedido=eq.producao&select=*`,
    {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`
      }
    }
  );

  const pedidos = await response.json();

  const texto = pedidos
    .map(
      (p) =>
        `🧾 ${p.pedido_codigo} - R$ ${p.total}`
    )
    .join("\n");

  await enviarTelegram({
    mensagem: `📦 <b>Pedidos em produção:</b>\n\n${texto}`
  });
}
