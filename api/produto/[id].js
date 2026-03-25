export default async function handler(req, res) {
  // 🔥 CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "ID obrigatório" });
    }

    // =========================
    // 🔹 1. BUSCAR PRODUTO BASE
    // =========================
    const produtoRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/produtos?id=eq.${id}&select=*,categorias(nome)`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        },
      }
    );

    const produtoData = await produtoRes.json();

    if (!produtoData || produtoData.length === 0) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    const produto = produtoData[0];

    const categoriaNome = produto.categorias?.nome;

    // =========================
    // 🔹 2. BUSCAR DETALHES
    // =========================
    let detalhes = null;

    // 🔥 CARIMBOS
    if (categoriaNome === "carimbo") {
      const resCarimbo = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/carimbos?produto_id=eq.${id}`,
        {
          headers: {
            apikey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          },
        }
      );

      const data = await resCarimbo.json();
      detalhes = data[0] || null;
    }

    // 🔥 CARTÕES
    if (categoriaNome === "cartao") {
      const resCartao = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/cartoes?produto_id=eq.${id}`,
        {
          headers: {
            apikey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          },
        }
      );

      const data = await resCartao.json();
      detalhes = data[0] || null;
    }

    // 🔥 PLACAS
    if (categoriaNome === "placa") {
      const resPlaca = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/placas?produto_id=eq.${id}`,
        {
          headers: {
            apikey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          },
        }
      );

      const data = await resPlaca.json();
      detalhes = data[0] || null;
    }

    // 🔥 PET
    if (categoriaNome === "pet") {
      const resPet = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/pet?produto_id=eq.${id}`,
        {
          headers: {
            apikey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
          },
        }
      );

      const data = await resPet.json();
      detalhes = data[0] || null;
    }

    // =========================
    // 🔹 3. FORMATAR RESPOSTA
    // =========================
    const response = {
      id: produto.id,
      nome: produto.nome,
      preco: produto.preco,
      categoria: categoriaNome,
      detalhes: detalhes,
    };

    return res.status(200).json(response);

  } catch (err) {
    console.error("ERRO:", err);
    return res.status(500).json({ error: "Erro ao buscar produto" });
  }
}