export default async function handler(req, res) {
  // 🔥 CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { categoria } = req.query;

    // 🔥 CONFIG DINÂMICA
    const config = {
      carimbo: {
        tabela: "carimbos",
        filtros: ["tipo_material"]
      },
      placa: {
        tabela: "placas",
        filtros: ["tipo_material"]
      },
      cartao: {
        tabela: "cartoes",
        filtros: ["tipo_material"]
      },
      pet: {
        tabela: "pet",
        filtros: ["formato"]
      }
    };

    let select = "*,categorias!inner(nome)";
    let filtros = "";

    // 🔥 aplica config da categoria
    const cfg = config[categoria];

    if (cfg) {
      select += `,${cfg.tabela}!inner(*)`;

      cfg.filtros.forEach(filtro => {
        if (req.query[filtro]) {
          filtros += `&${cfg.tabela}.${filtro}=eq.${req.query[filtro]}`;
        }
      });
    }

    // 🔥 monta URL
    let url = `${process.env.SUPABASE_URL}/rest/v1/produtos?select=${select}`;

    if (categoria) {
      url += `&categorias.nome=eq.${categoria}`;
    }

    url += filtros;

    console.log("URL FINAL:", url);

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      },
    });

    const data = await response.json();

    // 🔥 proteção contra erro do Supabase
    if (!Array.isArray(data)) {
      console.error("Erro Supabase:", data);
      return res.status(500).json({ error: data.message });
    }

    // 🔥 normalização
    const produtos = data.map(p => {
      const detalhes =
        p.carimbos?.[0] ||
        p.placas?.[0] ||
        p.cartoes?.[0] ||
        p.pet?.[0] ||
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