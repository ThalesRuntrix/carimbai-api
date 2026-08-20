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
      `&select=*,categorias(nome),produto_variacoes(*),produto_imagens(*),,produto_skus(*)`;

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      },
    });

    if (!response.ok) {

      const erro = await response.text();

      console.error("ERRO SUPABASE PRODUTO:", erro);

      return res.status(500).json({
        error: "Erro ao buscar produto"
      });

    }

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

    // =========================================================
    // ORDENA IMAGENS
    // =========================================================

    Object.values(imagensPorCor).forEach(lista => {

      lista.sort((a, b) => {
        return (a.ordem ?? 0) - (b.ordem ?? 0);
      });

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
    // FUNÇÃO AUXILIAR PARA IMAGENS
    // =========================

    function obterImagensDaVariacao(cor) {

      if (imagensCompartilhadas) {
        return imagensPorCor["sem_cor"] || [];
      }

      return imagensPorCor[cor] || [];

    }

    // =========================================================
    // SKUs
    // =========================================================

    const skus = p.produto_skus || [];

    // =========================================================
    // FUNÇÃO AUXILIAR
    // ENCONTRA O SKU DE UMA VARIAÇÃO
    // =========================================================

    function obterSkuDaVariacao(variacaoId) {

      return skus.find(sku =>
        sku.produto_variacao_id === variacaoId
      ) || null;

    }

    // =========================================================
    // PREÇO EFETIVO DO SKU
    // =========================================================

    function obterPrecoSku(sku) {

      if (
        sku &&
        sku.preco !== null &&
        sku.preco !== undefined
      ) {
        return Number(sku.preco);
      }

      return Number(p.preco);

    }

    // =========================================================
    // DISPONIBILIDADE
    // =========================================================

    function verificarDisponibilidade(sku) {

      if (!sku) {
        return false;
      }

      return (
        sku.ativo === true &&
        Number(sku.estoque) > 0
      );

    }

    // =========================
    // VARIAÇÕES
    // =========================

    let variacoes = (p.produto_variacoes || []).map(v => {

      const sku = obterSkuDaVariacao(v.id);

      return {

        id: v.id,

        cor: v.cor,

        hex: v.hex,

        sku_id: sku?.id || null,

        preco: obterPrecoSku(sku),

        estoque: sku
          ? Number(sku.estoque)
          : 0,

        disponivel:
          verificarDisponibilidade(sku),

        imagens:
          obterImagensDaVariacao(v.cor)

      };

    });

    // =========================
    // PRODUTOS SEM VARIAÇÃO
    // =========================

    if (variacoes.length === 0) {

      const sku = skus.find(sku =>
        sku.produto_variacao_id === null
      ) || null;

      variacoes = [

        {

          id: null,

          cor: null,

          hex: null,

          sku_id: sku?.id || null,

          preco: obterPrecoSku(sku),

          estoque: sku
            ? Number(sku.estoque)
            : 0,

          disponivel:
            verificarDisponibilidade(sku),

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

    console.error(
      "ERRO COMPLETO /api/produto/[id]:",
      err
    );

    return res.status(500).json({
      error: "Erro ao buscar produto"
    });

  }

}