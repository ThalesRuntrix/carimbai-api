import { pool } from "../lib/db.js";

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const ALLOWED_ORIGIN = "https://runtrix.com.br";

const CATEGORIAS_DETALHE = {
  carimbo: "carimbos",
  placa: "placas",
  cracha: "crachas"
};

// =====================================================
// CORS
// =====================================================

function configurarCors(res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Backoffice-Password"
  );
}

// =====================================================
// AUTENTICAÇÃO BACKOFFICE
// =====================================================

function autenticarBackoffice(req) {
  const senhaRecebida =
    req.headers["x-backoffice-password"];

  const senhaCorreta =
    process.env.BACKOFFICE_PASSWORD;

  if (!senhaCorreta || !senhaRecebida) {
    return false;
  }

  return senhaRecebida === senhaCorreta;
}

// =====================================================
// RESPOSTA
// =====================================================

function send(res, status, data) {
  return res.status(status).json(data);
}

// =====================================================
// NORMALIZAÇÃO
// =====================================================

function numeroOuNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numero = Number(value);

  return Number.isFinite(numero)
    ? numero
    : null;
}

function inteiroOuZero(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const numero = Number(value);

  return Number.isInteger(numero)
    ? numero
    : 0;
}

function textoOuNull(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const texto = String(value).trim();

  return texto || null;
}

// =====================================================
// VALIDA CATEGORIA
// =====================================================

async function validarCategoria(client, categoriaId) {

  if (
    categoriaId === null ||
    categoriaId === undefined
  ) {
    throw new Error(
      "categoria_id é obrigatório."
    );
  }

  const result = await client.query(
    `
      SELECT id, nome
      FROM categorias
      WHERE id = $1
      LIMIT 1
    `,
    [categoriaId]
  );

  if (result.rows.length === 0) {
    throw new Error(
      "Categoria não encontrada."
    );
  }

  return result.rows[0];
}

// =====================================================
// BUSCA PRODUTO COMPLETO
// =====================================================

async function buscarProdutoCompleto(client, produtoId) {

  const produtoResult = await client.query(
    `
      SELECT
        p.*,
        c.nome AS categoria
      FROM produtos p
      LEFT JOIN categorias c
        ON c.id = p.categoria_id
      WHERE p.id = $1
      LIMIT 1
    `,
    [produtoId]
  );

  if (produtoResult.rows.length === 0) {
    return null;
  }

  const produto = produtoResult.rows[0];

  const variacoesResult = await client.query(
    `
      SELECT *
      FROM produto_variacoes
      WHERE produto_id = $1
      ORDER BY
        principal DESC NULLS LAST,
        id ASC
    `,
    [produtoId]
  );

  const skusResult = await client.query(
    `
      SELECT
        id,
        produto_id,
        produto_variacao_id,
        sku,
        nome,
        cor,
        medida,
        material,
        preco,
        descricao,
        estoque,
        estoque_minimo,
        ativo,
        codigo_fornecedor,
        estoque_reservado,
        created_at,
        updated_at
      FROM produto_skus
      WHERE produto_id = $1
      ORDER BY id ASC
    `,
    [produtoId]
  );

  const imagensResult = await client.query(
    `
      SELECT *
      FROM produto_imagens
      WHERE produto_id = $1
      ORDER BY
        ordem ASC NULLS LAST,
        id ASC
    `,
    [produtoId]
  );

  const detalhesResult = await client.query(
    `
      SELECT *
      FROM carimbos
      WHERE produto_id = $1
      LIMIT 1
    `,
    [produtoId]
  );

  const placasResult = await client.query(
    `
      SELECT *
      FROM placas
      WHERE produto_id = $1
      LIMIT 1
    `,
    [produtoId]
  );

  const crachasResult = await client.query(
    `
      SELECT *
      FROM crachas
      WHERE produto_id = $1
      LIMIT 1
    `,
    [produtoId]
  );

  return {
    ...produto,

    carimbos:
      detalhesResult.rows,

    placas:
      placasResult.rows,

    crachas:
      crachasResult.rows,

    produto_variacoes:
      variacoesResult.rows,

    produto_skus:
      skusResult.rows,

    produto_imagens:
      imagensResult.rows
  };
}

// =====================================================
// LISTAGEM BACKOFFICE
// =====================================================

async function listarProdutosBackoffice(client) {

  const result = await client.query(
    `
      SELECT
        p.id,
        p.nome,
        p.preco,
        p.categoria_id,
        c.nome AS categoria,

        (
          SELECT COUNT(*)
          FROM produto_variacoes pv
          WHERE pv.produto_id = p.id
        ) AS total_variacoes,

        (
          SELECT json_agg(
            json_build_object(
              'id', ps.id,
              'sku', ps.sku,
              'ativo', ps.ativo
            )
            ORDER BY ps.id
          )
          FROM produto_skus ps
          WHERE ps.produto_id = p.id
        ) AS produto_skus,

        (
          SELECT COUNT(*)
          FROM produto_imagens pi
          WHERE pi.produto_id = p.id
        ) AS total_imagens

      FROM produtos p

      LEFT JOIN categorias c
        ON c.id = p.categoria_id

      ORDER BY p.id DESC
    `
  );

  return result.rows;
}

// =====================================================
// VALIDA PAYLOAD DO PRODUTO
// =====================================================

function validarPayloadProduto(body) {

  if (!body || typeof body !== "object") {
    throw new Error(
      "Dados do produto inválidos."
    );
  }

  const nome =
    String(body.nome || "").trim();

  if (!nome) {
    throw new Error(
      "Nome do produto é obrigatório."
    );
  }

  const preco =
    Number(body.preco);

  if (
    !Number.isFinite(preco) ||
    preco < 0
  ) {
    throw new Error(
      "Preço do produto inválido."
    );
  }

  if (
    !body.categoria_id ||
    !Number.isInteger(
      Number(body.categoria_id)
    )
  ) {
    throw new Error(
      "Categoria inválida."
    );
  }

  return {
    nome,
    preco,
    categoria_id:
      Number(body.categoria_id),

    detalhes:
      body.detalhes || {},

    variacoes:
      Array.isArray(body.variacoes)
        ? body.variacoes
        : [],

    skus:
      Array.isArray(body.skus)
        ? body.skus
        : [],

    imagens:
      Array.isArray(body.imagens)
        ? body.imagens
        : []
  };
}

// =====================================================
// VALIDA SKU
// =====================================================

function validarSku(sku, index) {

  const identificacao =
    `SKU #${index + 1}`;

  const codigo =
    String(sku.sku || "").trim();

  if (!codigo) {
    throw new Error(
      `${identificacao}: SKU é obrigatório.`
    );
  }

  if (
    sku.id !== undefined &&
    sku.id !== null &&
    !Number.isInteger(Number(sku.id))
  ) {
    throw new Error(
      `${identificacao}: ID do SKU inválido.`
    );
  }

  return codigo;
}

// =====================================================
// CRIAR PRODUTO
// =====================================================

async function criarProduto(client, body) {

  const payload =
    validarPayloadProduto(body);

  await validarCategoria(
    client,
    payload.categoria_id
  );

  // ===================================================
  // PRODUTO
  // ===================================================

  const produtoResult =
    await client.query(
      `
        INSERT INTO produtos (
          nome,
          categoria_id,
          preco
        )
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [
        payload.nome,
        payload.categoria_id,
        payload.preco
      ]
    );

  const produtoId =
    produtoResult.rows[0].id;

  // ===================================================
  // DETALHE DA CATEGORIA
  // ===================================================

  await salvarDetalhesCategoria(
    client,
    produtoId,
    payload.categoria_id,
    payload.detalhes
  );

  // ===================================================
  // VARIAÇÕES
  // ===================================================

  const mapaVariacoes =
    new Map();

  for (const variacao of payload.variacoes) {

    const cor =
      textoOuNull(variacao.cor);

    const result =
      await client.query(
        `
          INSERT INTO produto_variacoes (
            produto_id,
            cor,
            hex,
            imagem_url,
            principal
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [
          produtoId,
          cor,
          textoOuNull(variacao.hex),
          textoOuNull(variacao.imagem_url),
          variacao.principal === true
        ]
      );

    const criada =
      result.rows[0];

    if (cor) {
      mapaVariacoes.set(
        cor,
        criada.id
      );
    }

    if (variacao.id) {
      // IDs enviados na criação são ignorados.
      // O banco é quem define os novos IDs.
    }
  }

  // ===================================================
  // SKUs
  // ===================================================

  for (
    let index = 0;
    index < payload.skus.length;
    index++
  ) {

    const sku =
      payload.skus[index];

    const codigo =
      validarSku(sku, index);

    const variacaoId =
      obterVariacaoId(
        sku,
        mapaVariacoes
      );

    await client.query(
      `
        INSERT INTO produto_skus (
          produto_id,
          produto_variacao_id,
          sku,
          nome,
          cor,
          medida,
          material,
          preco,
          descricao,
          estoque,
          estoque_minimo,
          ativo,
          estoque_reservado
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          0, $10, $11, 0
        )
      `,
      [
        produtoId,
        variacaoId,
        codigo,
        textoOuNull(sku.nome),
        textoOuNull(sku.cor),
        textoOuNull(sku.medida),
        textoOuNull(sku.material),
        numeroOuNull(sku.preco),
        textoOuNull(sku.descricao),
        Math.max(
          0,
          inteiroOuZero(
            sku.estoque_minimo
          )
        ),
        sku.ativo !== false
      ]
    );
  }

  // ===================================================
  // IMAGENS
  // ===================================================

  await salvarImagens(
    client,
    produtoId,
    payload.imagens
  );

  return buscarProdutoCompleto(
    client,
    produtoId
  );
}

// =====================================================
// SALVAR DETALHES DA CATEGORIA
// =====================================================

async function salvarDetalhesCategoria(
  client,
  produtoId,
  categoriaId,
  detalhes
) {

  const categoria =
    await validarCategoria(
      client,
      categoriaId
    );

  const nomeCategoria =
    String(categoria.nome || "")
      .trim()
      .toLowerCase();

  // ===================================================
  // CARIMBO
  // ===================================================

  if (nomeCategoria === "carimbo") {

    await client.query(
      `
        INSERT INTO carimbos (
          produto_id,
          marca,
          modelo,
          medida,
          tipo_material
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        produtoId,
        textoOuNull(detalhes.marca),
        textoOuNull(detalhes.modelo),
        textoOuNull(detalhes.medida),
        textoOuNull(detalhes.tipo_material)
      ]
    );

    return;
  }

  // ===================================================
  // PLACA
  // ===================================================

  if (nomeCategoria === "placa") {

    await client.query(
      `
        INSERT INTO placas (
          produto_id,
          medida,
          tipo_material,
          espessura
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        produtoId,
        textoOuNull(detalhes.medida),
        textoOuNull(detalhes.tipo_material),
        textoOuNull(detalhes.espessura)
      ]
    );

    return;
  }

  // ===================================================
  // CRACHÁ
  // ===================================================

  if (nomeCategoria === "cracha") {

    await client.query(
      `
        INSERT INTO crachas (
          produto_id,
          medida,
          tipo_material
        )
        VALUES ($1, $2, $3)
      `,
      [
        produtoId,
        textoOuNull(detalhes.medida),
        textoOuNull(detalhes.tipo_material)
      ]
    );

    return;
  }
}

// =====================================================
// ATUALIZAR DETALHES DA CATEGORIA
// =====================================================

async function atualizarDetalhesCategoria(
  client,
  produtoId,
  categoriaId,
  detalhes
) {

  // Remove apenas o detalhe de categoria.
  // NÃO mexe em SKUs, estoque ou imagens.

  await client.query(
    `DELETE FROM carimbos WHERE produto_id = $1`,
    [produtoId]
  );

  await client.query(
    `DELETE FROM placas WHERE produto_id = $1`,
    [produtoId]
  );

  await client.query(
    `DELETE FROM crachas WHERE produto_id = $1`,
    [produtoId]
  );

  await salvarDetalhesCategoria(
    client,
    produtoId,
    categoriaId,
    detalhes
  );
}

// =====================================================
// OBTÉM ID DA VARIAÇÃO
// =====================================================

function obterVariacaoId(
  sku,
  mapaVariacoes
) {

  if (
    sku.produto_variacao_id !==
    undefined &&
    sku.produto_variacao_id !== null
  ) {
    return Number(
      sku.produto_variacao_id
    );
  }

  const cor =
    textoOuNull(sku.cor);

  if (cor && mapaVariacoes.has(cor)) {
    return mapaVariacoes.get(cor);
  }

  return null;
}

// =====================================================
// ATUALIZAR PRODUTO
// =====================================================

async function atualizarProduto(
  client,
  produtoId,
  body
) {

  const payload =
    validarPayloadProduto(body);

  // ===================================================
  // EXISTÊNCIA
  // ===================================================

  const existente =
    await client.query(
      `
        SELECT id, categoria_id
        FROM produtos
        WHERE id = $1
        LIMIT 1
      `,
      [produtoId]
    );

  if (existente.rows.length === 0) {
    throw new Error(
      "Produto não encontrado."
    );
  }

  // ===================================================
  // CATEGORIA
  // ===================================================

  await validarCategoria(
    client,
    payload.categoria_id
  );

  // ===================================================
  // PRODUTO
  // ===================================================

  await client.query(
    `
      UPDATE produtos
      SET
        nome = $1,
        categoria_id = $2,
        preco = $3
      WHERE id = $4
    `,
    [
      payload.nome,
      payload.categoria_id,
      payload.preco,
      produtoId
    ]
  );

  // ===================================================
  // DETALHES
  // ===================================================

  await atualizarDetalhesCategoria(
    client,
    produtoId,
    payload.categoria_id,
    payload.detalhes
  );

  // ===================================================
  // VARIAÇÕES
  // ===================================================

  const variacoesExistentes =
    await client.query(
      `
        SELECT id
        FROM produto_variacoes
        WHERE produto_id = $1
      `,
      [produtoId]
    );

  const idsVariacoesRecebidas =
    new Set();

  for (const variacao of payload.variacoes) {

    const id =
      variacao.id
        ? Number(variacao.id)
        : null;

    if (id) {

      const result =
        await client.query(
          `
            UPDATE produto_variacoes
            SET
              cor = $1,
              hex = $2,
              imagem_url = $3,
              principal = $4
            WHERE
              id = $5
              AND produto_id = $6
            RETURNING id
          `,
          [
            textoOuNull(variacao.cor),
            textoOuNull(variacao.hex),
            textoOuNull(variacao.imagem_url),
            variacao.principal === true,
            id,
            produtoId
          ]
        );

      if (result.rows.length === 0) {
        throw new Error(
          `Variação ${id} não pertence ao produto.`
        );
      }

      idsVariacoesRecebidas.add(id);

    } else {

      const result =
        await client.query(
          `
            INSERT INTO produto_variacoes (
              produto_id,
              cor,
              hex,
              imagem_url,
              principal
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
          `,
          [
            produtoId,
            textoOuNull(variacao.cor),
            textoOuNull(variacao.hex),
            textoOuNull(variacao.imagem_url),
            variacao.principal === true
          ]
        );

      idsVariacoesRecebidas.add(
        result.rows[0].id
      );
    }
  }

  // ===================================================
  // VARIAÇÕES REMOVIDAS
  // ===================================================
  //
  // Só removemos variações que não estão sendo
  // referenciadas por nenhum SKU.
  //
  // Se um SKU antigo ainda usa a variação,
  // preservamos a variação.

  for (
    const row of variacoesExistentes.rows
  ) {

    if (
      idsVariacoesRecebidas.has(row.id)
    ) {
      continue;
    }

    const uso =
      await client.query(
        `
          SELECT 1
          FROM produto_skus
          WHERE produto_variacao_id = $1
          LIMIT 1
        `,
        [row.id]
      );

    if (uso.rows.length === 0) {

      await client.query(
        `
          DELETE FROM produto_variacoes
          WHERE id = $1
            AND produto_id = $2
        `,
        [
          row.id,
          produtoId
        ]
      );
    }
  }

  // ===================================================
  // SKUs
  // ===================================================

  const skusExistentes =
    await client.query(
      `
        SELECT
          id,
          estoque,
          estoque_reservado
        FROM produto_skus
        WHERE produto_id = $1
      `,
      [produtoId]
    );

  const idsSkusRecebidos =
    new Set();

  for (
    let index = 0;
    index < payload.skus.length;
    index++
  ) {

    const sku =
      payload.skus[index];

    const codigo =
      validarSku(sku, index);

    const id =
      sku.id
        ? Number(sku.id)
        : null;

    const variacaoId =
      obterVariacaoId(
        sku,
        new Map(
          payload.variacoes
            .filter(v => v.id)
            .map(v => [
              v.cor,
              Number(v.id)
            ])
        )
      );

    if (id) {

      const result =
        await client.query(
          `
            UPDATE produto_skus
            SET
              produto_variacao_id = $1,
              sku = $2,
              nome = $3,
              cor = $4,
              medida = $5,
              material = $6,
              preco = $7,
              descricao = $8,
              estoque_minimo = $9,
              
              updated_at = now()
            WHERE
              id = $11
              AND produto_id = $12
            RETURNING id
          `,
          [
            variacaoId,
            codigo,
            textoOuNull(sku.nome),
            textoOuNull(sku.cor),
            textoOuNull(sku.medida),
            textoOuNull(sku.material),
            numeroOuNull(sku.preco),
            textoOuNull(sku.descricao),
            Math.max(
              0,
              inteiroOuZero(
                sku.estoque_minimo
              )
            ),            
            id,
            produtoId
          ]
        );

      if (result.rows.length === 0) {
        throw new Error(
          `SKU ${id} não pertence ao produto.`
        );
      }

      idsSkusRecebidos.add(id);

    } else {

      const result =
        await client.query(
          `
            INSERT INTO produto_skus (
              produto_id,
              produto_variacao_id,
              sku,
              nome,
              cor,
              medida,
              material,
              preco,
              descricao,
              estoque,
              estoque_minimo,
              ativo,
              estoque_reservado
            )
            VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9,
              0, $10, $11, 0
            )
            RETURNING id
          `,
          [
            produtoId,
            variacaoId,
            codigo,
            textoOuNull(sku.nome),
            textoOuNull(sku.cor),
            textoOuNull(sku.medida),
            textoOuNull(sku.material),
            numeroOuNull(sku.preco),
            textoOuNull(sku.descricao),
            Math.max(
              0,
              inteiroOuZero(
                sku.estoque_minimo
              )
            ),
            sku.ativo !== false
          ]
        );

      idsSkusRecebidos.add(
        result.rows[0].id
      );
    }
  }

  // ===================================================
  // SKUs REMOVIDOS DO CADASTRO
  // ===================================================
  //
  // NÃO apagamos.
  //
  // Apenas desativamos.
  //
  // Isso preserva:
  //
  // pedido_itens
  // reservas
  // histórico
  // estoque
  //

  for (
    const row of skusExistentes.rows
  ) {

    if (
      idsSkusRecebidos.has(row.id)
    ) {
      continue;
    }

    await client.query(
      `
        UPDATE produto_skus
        SET
          ativo = false,
          updated_at = now()
        WHERE id = $1
          AND produto_id = $2
      `,
      [
        row.id,
        produtoId
      ]
    );
  }

  // ===================================================
  // IMAGENS
  // ===================================================
  //
  // Imagens não possuem referência histórica.
  // Podemos sincronizá-las normalmente.
  //

  await client.query(
    `
      DELETE FROM produto_imagens
      WHERE produto_id = $1
    `,
    [produtoId]
  );

  await salvarImagens(
    client,
    produtoId,
    payload.imagens
  );

  return buscarProdutoCompleto(
    client,
    produtoId
  );
}

// =====================================================
// IMAGENS
// =====================================================

async function salvarImagens(
  client,
  produtoId,
  imagens
) {

  for (
    let index = 0;
    index < imagens.length;
    index++
  ) {

    const imagem =
      imagens[index];

    const url =
      String(
        imagem.imagem_url || ""
      ).trim();

    if (!url) {
      continue;
    }

    await client.query(
      `
        INSERT INTO produto_imagens (
          produto_id,
          imagem_url,
          tipo,
          ordem,
          cor
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        produtoId,
        url,
        textoOuNull(imagem.tipo),
        Number.isInteger(
          Number(imagem.ordem)
        )
          ? Number(imagem.ordem)
          : index,
        textoOuNull(imagem.cor)
      ]
    );
  }
}

// =====================================================
// HANDLER
// =====================================================

export default async function handler(req, res) {

  configurarCors(res);

  // ===================================================
  // OPTIONS
  // ===================================================

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ===================================================
  // ROTAS BACKOFFICE
  // ===================================================

  const acao =
    req.query.acao;

  const ehBackoffice =
    acao === "backoffice";

  // ===================================================
  // SEGURANÇA
  // ===================================================

  if (ehBackoffice) {

    if (!autenticarBackoffice(req)) {

      return send(
        res,
        401,
        {
          error:
            "Não autorizado."
        }
      );
    }

  }

  // ===================================================
  // BACKOFFICE
  // ===================================================

  if (ehBackoffice) {

    const client =
      await pool.connect();

    try {

      // ===============================================
      // GET
      // ===============================================

      if (req.method === "GET") {

        // ---------------------------------------------
        // PRODUTO ESPECÍFICO
        // ---------------------------------------------

        if (req.query.id) {

          const produtoId =
            Number(req.query.id);

          if (
            !Number.isInteger(
              produtoId
            )
          ) {
            return send(
              res,
              400,
              {
                error:
                  "ID do produto inválido."
              }
            );
          }

          const produto =
            await buscarProdutoCompleto(
              client,
              produtoId
            );

          if (!produto) {

            return send(
              res,
              404,
              {
                error:
                  "Produto não encontrado."
              }
            );
          }

          return send(
            res,
            200,
            produto
          );
        }

        // ---------------------------------------------
        // LISTAGEM
        // ---------------------------------------------

        const produtos =
          await listarProdutosBackoffice(
            client
          );

        return send(
          res,
          200,
          produtos
        );
      }

      // ===============================================
      // POST
      // ===============================================

      if (req.method === "POST") {

        await client.query("BEGIN");

        const produto =
          await criarProduto(
            client,
            req.body
          );

        await client.query("COMMIT");

        return send(
          res,
          201,
          {
            message:
              "Produto criado com sucesso.",
            produto
          }
        );
      }

      // ===============================================
      // PATCH
      // ===============================================

      if (req.method === "PATCH") {

        const produtoId =
          Number(req.query.id);

        if (
          !Number.isInteger(
            produtoId
          )
        ) {

          return send(
            res,
            400,
            {
              error:
                "ID do produto inválido."
            }
          );
        }

        await client.query("BEGIN");

        const produto =
          await atualizarProduto(
            client,
            produtoId,
            req.body
          );

        await client.query("COMMIT");

        return send(
          res,
          200,
          {
            message:
              "Produto atualizado com sucesso.",
            produto
          }
        );
      }

      // ===============================================
      // MÉTODO NÃO PERMITIDO
      // ===============================================

      return send(
        res,
        405,
        {
          error:
            "Método não permitido."
        }
      );

    } catch (error) {

      try {
        await client.query("ROLLBACK");
      } catch (_) {}

      console.error(
        "ERRO BACKOFFICE PRODUTOS:",
        error
      );

      return send(
        res,
        500,
        {
          error:
            error.message ||
            "Erro ao processar produto."
        }
      );

    } finally {

      client.release();
    }
  }

  // ===================================================
  // API PÚBLICA EXISTENTE
  // ===================================================

  if (req.method !== "GET") {

    return send(
      res,
      405,
      {
        error:
          "Método não permitido."
      }
    );
  }

  try {

    const {
      categoria
    } = req.query;

    const config = {

      carimbo: {
        tabela: "carimbos",
        filtros: [
          "tipo_material"
        ]
      },

      placa: {
        tabela: "placas",
        filtros: [
          "tipo_material"
        ]
      },

      cracha: {
        tabela: "crachas",
        filtros: [
          "tipo_material"
        ]
      }
    };

    let select =
      "*,categorias!inner(nome),produto_imagens(*),produto_skus(*)";

    let filtros = "";

    const cfg =
      config[categoria];

    if (cfg) {

      select +=
        `,${cfg.tabela}!inner(*)`;

      cfg.filtros.forEach(
        filtro => {

          if (req.query[filtro]) {

            filtros +=
              `&${cfg.tabela}.${filtro}=eq.${req.query[filtro]}`;
          }
        }
      );
    }

    let url =
      `${process.env.SUPABASE_URL}/rest/v1/produtos?select=${select}`;

    if (categoria) {

      url +=
        `&categorias.nome=eq.${categoria}`;
    }

    url += filtros;

    const response =
      await fetch(
        url,
        {
          headers: {
            apikey:
              process.env.SUPABASE_KEY,

            Authorization:
              `Bearer ${process.env.SUPABASE_KEY}`
          }
        }
      );

    const data =
      await response.json();

    if (!Array.isArray(data)) {

      console.error(
        "Erro Supabase:",
        data
      );

      return send(
        res,
        500,
        {
          error:
            data.message ||
            "Erro ao buscar produtos."
        }
      );
    }    

    const produtos =
      data.map(p => {

        const skus = p.produto_skus || [];

      const skuComPreco = skus.find(
        sku =>
          sku.preco !== null &&
          sku.preco !== undefined
      );

      const preco = skuComPreco
        ? Number(skuComPreco.preco)
        : Number(p.preco);

        const detalhes =
          p.carimbos?.[0] ||
          p.placas?.[0] ||
          p.crachas?.[0] ||
          null;

        const imagens =
          p.produto_imagens
            ?.sort(
              (a, b) =>
                (a.ordem || 0) -
                (b.ordem || 0)
            )
            .map(
              img =>
                img.imagem_url
            ) || [];

        const imagemPrincipal =
          imagens[0] || null;

        return {

          id: p.id,

          nome: p.nome,

          preco,

          categoria:
            p.categorias?.nome ||
            null,

          imagem_url:
            imagemPrincipal,

          imagens,

          detalhes
        };
      });

    return send(
      res,
      200,
      produtos
    );

  } catch (err) {

    console.error(
      "ERRO API PRODUTOS:",
      err
    );

    return send(
      res,
      500,
      {
        error:
          "Erro ao buscar produtos."
      }
    );
  }
}
