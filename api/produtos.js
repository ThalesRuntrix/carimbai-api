export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 🔥 preflight (IMPORTANTE)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { categoria, tipo_material } = req.query;

    let select = "*,categorias(nome)";
    let filtros = "";

    // 🔥 define JOIN baseado na categoria
    if (categoria === "carimbo") {
      select += ",carimbos(*)";

      if (tipo_material) {
        filtros += `&carimbos.tipo_material=eq.${tipo_material}`;
      }
    }

    if (categoria === "placa") {
      select += ",placas(*)";

      if (tipo_material) {
        filtros += `&placas.tipo_material=eq.${tipo_material}`;
      }
    }

    if (categoria === "cartao") {
      select += ",cartoes(*)";

      if (tipo_material) {
        filtros += `&cartoes.tipo_material=eq.${tipo_material}`;
      }
    }

    // 🔥 monta URL final
    let url = `${process.env.SUPABASE_URL}/rest/v1/produtos?select=${select}`;

    if (categoria) {
      url += `&categorias.nome=eq.${categoria}`;
    }

    url += filtros;

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      },
    });

    const data = await response.json();

    // 🔥 normalização
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

/*export default async function handler(req, res) {

  // 🔥 CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 🔥 preflight (IMPORTANTE)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { categoria, search, page = 1, limit = 10 } = req.query;    

    let url = `${process.env.SUPABASE_URL}/rest/v1/produtos?select=*,categorias(nome)`;
        

    
    if (categoria) {
      url += `&categoria_id=eq.${categoria}`;      
    } 

    if (search) {
    url += `&nome=ilike.*${search}*`;      
    }

    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;
    

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        Range: `${from}-${to}`,
      },
    });
    
    const data = await response.json();
    
    const produtos = data.map(p => ({
      id: p.id,
      nome: p.nome,
      preco: p.preco,
      categoria: p.categorias?.nome || null,
    }));
    
    res.status(200).json(produtos);

  } catch (err) {
    console.error("ERRO:", err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
}*/