export default async function handler(req, res) {
  // =========================
  // CORS
  // =========================

  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://runtrix.com.br"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {

    const { id } = req.query;

    // =========================
    // BUSCA PRODUTO
    // =========================

    const url =
      `${process.env.SUPABASE_URL}/rest/v1/produtos` +
      `?id=eq.${id}` +
      `&select=*,categorias(nome),produto_variacoes(*),produto_imagens(*)`;

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      },
    });

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).json({
        error: "Produto não encontrado"
      });
    }

    const p = data[0];

    // =========================
    // AGRUPA IMAGENS POR COR
    // =========================

    const imagensPorCor = {};

    (p.produto_imagens || []).forEach(img => {

      const cor = img.cor || "sem_cor";

      if (!imagensPorCor[cor]) {
        imagensPorCor[cor] = [];
      }

      imagensPorCor[cor].push({
        id: img.id,
        tipo: img.tipo,
        ordem: img.ordem,
        imagem_url: img.imagem_url
      });

    });

    // Ordena pela ordem cadastrada

    Object.values(imagensPorCor).forEach(lista => {

      lista.sort((a, b) => a.ordem - b.ordem);

    });

    // =========================
    // DETECTA IMAGENS COMPARTILHADAS
    // =========================

    const gruposDeImagem =
      Object.keys(imagensPorCor);

    const imagensCompartilhadas =

      gruposDeImagem.length === 1 &&
      gruposDeImagem[0] === "sem_cor";

    // =========================
    // FUNÇÃO AUXILIAR
    // =========================

    function obterImagensDaVariacao(cor) {

      if (imagensCompartilhadas) {
        return imagensPorCor["sem_cor"] || [];
      }

      return imagensPorCor[cor] || [];

    }

    // =========================
    // VARIAÇÕES
    // =========================

    let variacoes = (p.produto_variacoes || []).map(v => ({

      cor: v.cor,
      hex: v.hex,
      preco: v.preco,

      imagens: obterImagensDaVariacao(v.cor)

    }));

    // =========================
    // PRODUTOS SEM VARIAÇÃO
    // =========================

    if (variacoes.length === 0) {

      variacoes = [

        {

          cor: null,

          hex: null,

          preco: p.preco,

          imagens:
            imagensPorCor["sem_cor"] || []

        }

      ];

    }

    // =========================
    // RETORNO
    // =========================

    const produto = {

      id: p.id,

      nome: p.nome,

      preco: p.preco,

      categoria: p.categorias?.nome || null,

      variacoes

    };

    res.status(200).json(produto);

  } catch (err) {

    console.error("ERRO COMPLETO:", err);

    res.status(500).json({
      error: "Erro ao buscar produto"
    });

  }

}