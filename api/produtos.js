export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { categoria, tipo_material } = req.query;

    let select = "*,categorias!inner(nome)";
    let filtros = "";

    // 🔥 CARIMBOS
    if (categoria === "carimbo") {
      select += ",carimbos!inner(*)";

      if (tipo_material) {
        filtros += `&carimbos.tipo_material=eq.${tipo_material}`;
      }
    }

    // 🔥 PLACAS
    if (categoria === "placa") {
      select += ",placas!inner(*)";

      if (tipo_material) {
        filtros += `&placas.tipo_material=eq.${tipo_material}`;
      }
    }

    // 🔥 CARTÕES
    if (categoria === "cartao") {
      select += ",cartoes!inner(*)";

      if (tipo_material) {
        filtros += `&cartoes.tipo_material=eq.${tipo_material}`;
      }
    }

    // 🔥 URL FINAL CORRETA
    let url = `${process.env.SUPABASE_URL}/rest/v1/produtos?select=${select}`;

    if (categoria) {
      url += `&categorias.nome=eq.${categoria}`;
    }

    url += filtros;

    console.log("URL FINAL:", url); // 🔥 DEBUG IMPORTANTE

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      },
    });

    const data = await response.json();

    console.log("DATA:", data); // 🔥 DEBUG

    const produtos = data.map(p => {
      const detalhes =
        p.carimbos?.[0] ||
        p.placas?.[0] ||
        p.cartoes?.[0] ||
        null;

      return {
        id: p.id,
        nome: p.nome,
        preco: p.preco,
        categoria: p.categorias?.nome || null,
        detalhes
      };
    });

    res.status(200).json(produtos);

  } catch (err) {
    console.error("ERRO:", err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
}