export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const body = req.body;

    // 🔥 gerar ID do pedido
    const pedidoCodigo = `PED-${Date.now()}`;

    // 🔥 inserir no Supabase
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pedido_codigo: pedidoCodigo,

          produto_id: body.produto_id,
          produto_nome: body.produto_nome,

          nome: body.nome,
          email: body.email,
          cpf: body.cpf,

          rua: body.rua,
          numero: body.numero,
          complemento: body.complemento,
          bairro: body.bairro,
          cidade: body.cidade,
          estado: body.estado,
          cep: body.cep,

          entrega: body.entrega,
          pagamento: body.pagamento,
        }),
      }
    );

    const data = await response.json();

    return res.status(200).json({
      success: true,
      pedido_codigo: pedidoCodigo,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar pedido" });
  }
}