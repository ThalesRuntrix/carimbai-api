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

    // 🔥 URL com JOIN + VARIAÇÕES
    const url = `${process.env.SUPABASE_URL}/rest/v1/produtos?id=eq.${id}&select=*,categorias(nome),produto_variacoes(*),produto_imagens(*)`;

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      },
    });

    const data = await response.json();

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Produto não encontrado" });
    }

    const p = data[0];

    // 🔥 FORMATAÇÃO FINAL
    const produto = {
      id: p.id,
      nome: p.nome,
      preco: p.preco,
      categoria: p.categorias?.nome || null,
      imagens: p.produto_imagens || null,
      variacoes: (p.produto_variacoes || []).map(v => ({
        cor: v.cor,
        hex: v.hex,
        imagem_url: v.imagem_url,
        preco: v.preco
      }))
    };

    res.status(200).json(produto);

  } catch (err) {
    console.error("ERRO COMPLETO:", err);
    res.status(500).json({ error: "Erro ao buscar produto" });
  }
}
