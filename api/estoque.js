import { pool } from "../lib/db.js";

function send(res, status, data) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://runtrix.com.br"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  return res.status(status).json(data);
}

function validarId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function verificarSenha(req) {
  const senha = req.headers["x-backoffice-password"];

  if (!senha) {
    return false;
  }

  return senha === process.env.BACKOFFICE_PASSWORD;
}

const loginRateLimitMap = new Map();
function rateLimitLogin(req, limit = 5, windowMs = 60000) {

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();

  if (!loginRateLimitMap.has(ip)) {
    loginRateLimitMap.set(ip, []);
  }

  const timestamps = loginRateLimitMap.get(ip);

  const recent = timestamps.filter(
    t => now - t < windowMs
  );

  if (recent.length >= limit) {
    return false;
  }

  recent.push(now);

  loginRateLimitMap.set(ip, recent);

  return true;
}


// ======================================================
// GET - LISTA ESTOQUE
// ======================================================

async function listarEstoque(req, res) {

  const {
    busca,
    ativo,
    baixo_estoque
  } = req.query;

  let sql = `
    SELECT
      ps.id,
      ps.produto_id,
      p.nome AS produto,
      ps.produto_variacao_id,
      ps.sku,
      ps.nome AS sku_nome,
      ps.cor,
      ps.estoque,
      ps.estoque_minimo,
      ps.ativo
    FROM produto_skus ps
    INNER JOIN produtos p
      ON p.id = ps.produto_id
    WHERE 1 = 1
  `;

  const params = [];
  let paramIndex = 1;

  // Busca por produto / SKU / cor
  if (busca) {

    sql += `
      AND (
        p.nome ILIKE $${paramIndex}
        OR ps.sku ILIKE $${paramIndex}
        OR ps.cor ILIKE $${paramIndex}
      )
    `;

    params.push(`%${busca}%`);
    paramIndex++;
  }

  // Filtro ativo
  if (ativo === "true" || ativo === "false") {

    sql += `
      AND ps.ativo = $${paramIndex}
    `;

    params.push(ativo === "true");
    paramIndex++;
  }

  // Estoque baixo
  if (baixo_estoque === "true") {

    sql += `
      AND ps.estoque <= ps.estoque_minimo
    `;
  }

  sql += `
    ORDER BY
      p.nome ASC,
      ps.cor ASC,
      ps.id ASC
  `;

  const result = await pool.query(sql, params);

  return send(res, 200, result.rows);
}


// ======================================================
// GET - DETALHES DE UM SKU
// ======================================================

async function buscarSKU(req, res, id) {

  const result = await pool.query(
    `
    SELECT
      ps.id,
      ps.produto_id,
      p.nome AS produto,
      p.preco,
      ps.produto_variacao_id,
      pv.cor AS variacao_cor,
      pv.hex,
      ps.sku,
      ps.nome AS sku_nome,
      ps.cor,
      ps.estoque,
      ps.estoque_minimo,
      ps.ativo
    FROM produto_skus ps
    INNER JOIN produtos p
      ON p.id = ps.produto_id
    LEFT JOIN produto_variacoes pv
      ON pv.id = ps.produto_variacao_id
    WHERE ps.id = $1
    `,
    [id]
  );

  if (result.rows.length === 0) {
    return send(res, 404, {
      error: "SKU não encontrado"
    });
  }

  return send(res, 200, result.rows[0]);
}


// ======================================================
// GET - HISTÓRICO
// ======================================================

async function listarMovimentacoes(req, res, id) {

  const result = await pool.query(
    `
    SELECT
      me.id,
      me.produto_sku_id,
      me.tipo,
      me.quantidade,
      me.estoque_anterior,
      me.estoque_posterior,
      me.motivo,
      me.pedido_id,
      me.observacao,
      me.created_at,
      p.pedido_codigo
    FROM movimentacoes_estoque me
    LEFT JOIN pedidos p
      ON p.id = me.pedido_id
    WHERE me.produto_sku_id = $1
    ORDER BY
      me.created_at DESC,
      me.id DESC
    `,
    [id]
  );

  return send(res, 200, result.rows);
}


// ======================================================
// POST - MOVIMENTAÇÃO
// ======================================================

async function registrarMovimentacao(req, res) {

  const {
    produto_sku_id,
    tipo,
    quantidade,
    estoque_final,
    motivo,
    observacao,
    pedido_id
  } = req.body || {};

  const skuId = validarId(produto_sku_id);

  if (!skuId) {
    return send(res, 400, {
      error: "produto_sku_id inválido"
    });
  }

  // ----------------------------
  // tipo
  // ----------------------------

  if (!["entrada", "saida", "ajuste"].includes(tipo)) {

    return send(res, 400, {
      error: "Tipo de movimentação inválido"
    });
  }

  // ----------------------------
  // entrada / saída
  // ----------------------------

  let quantidadeFinal = null;

  if (tipo === "entrada" || tipo === "saida") {

    quantidadeFinal = Number(quantidade);

    if (
      !Number.isInteger(quantidadeFinal) ||
      quantidadeFinal <= 0
    ) {

      return send(res, 400, {
        error: "Quantidade inválida"
      });
    }
  }

  // ----------------------------
  // ajuste
  // ----------------------------

  let estoqueFinal = null;

  if (tipo === "ajuste") {

    estoqueFinal = Number(estoque_final);

    if (
      !Number.isInteger(estoqueFinal) ||
      estoqueFinal < 0
    ) {

      return send(res, 400, {
        error: "Estoque final inválido"
      });
    }
  }

  // ----------------------------
  // pedido opcional
  // ----------------------------

  let pedidoIdFinal = null;

  if (
    pedido_id !== undefined &&
    pedido_id !== null &&
    pedido_id !== ""
  ) {

    pedidoIdFinal = validarId(pedido_id);

    if (!pedidoIdFinal) {

      return send(res, 400, {
        error: "pedido_id inválido"
      });
    }
  }

  try {

    const result = await pool.query(
      `
      SELECT *
      FROM registrar_movimentacao_estoque(
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )
      `,
      [
        skuId,
        tipo,
        quantidadeFinal,
        estoqueFinal,
        motivo || null,
        observacao || null,
        pedidoIdFinal
      ]
    );

    return send(res, 200, result.rows[0]);

  } catch (err) {

    console.error(
      "Erro ao registrar movimentação:",
      err
    );

    const regrasNegocio = [
      "Estoque insuficiente",
      "não encontrado",
      "não altera",
      "Tipo de movimentação",
      "quantidade",
      "estoque final"
    ];

    const erroRegra = regrasNegocio.some(
      texto => err.message?.includes(texto)
    );

    if (erroRegra) {

      return send(res, 400, {
        error: err.message
      });
    }

    return send(res, 500, {
      error: "Erro ao registrar movimentação"
    });
  }
}


// ======================================================
// HANDLER PRINCIPAL
// ======================================================

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    return send(res, 200, {});
  }

  // =========================
  // LOGIN
  // =========================
  if (acao === "login") {

    if (!rateLimitLogin(req)) {
      return res.status(429).json({
        error: "Muitas tentativas. Tente novamente em instantes."
      });
    }

    const { senha } = req.body || {};

    if (!senha) {
      return res.status(400).json({
        error: "Senha não informada"
      });
    }

    if (senha !== process.env.BACKOFFICE_PASSWORD) {
      return res.status(401).json({
        error: "Senha incorreta"
      });
    }

    return res.status(200).json({
      autenticado: true
    });
  }


  // =========================
  // AUTENTICAÇÃO
  // =========================
  if (!verificarSenha(req)) {
    return res.status(401).json({
      error: "Não autorizado"
    });
  }

  try {

    // ==================================================
    // GET
    // ==================================================

    if (req.method === "GET") {

      const id = req.query.id;

      // ----------------------------------------------
      // GET /api/estoque
      // ----------------------------------------------

      if (!id) {

        if (req.query.historico === "true") {

          return send(res, 400, {
            error: "Informe o ID do SKU para consultar o histórico"
          });
        }

        return await listarEstoque(req, res);
      }

      // ----------------------------------------------
      // GET /api/estoque?id=1
      // ----------------------------------------------

      const skuId = validarId(id);

      if (!skuId) {

        return send(res, 400, {
          error: "ID do SKU inválido"
        });
      }

      // ----------------------------------------------
      // GET /api/estoque?id=1&historico=true
      // ----------------------------------------------

      if (req.query.historico === "true") {

        return await listarMovimentacoes(
          req,
          res,
          skuId
        );
      }

      // ----------------------------------------------
      // GET /api/estoque?id=1
      // ----------------------------------------------

      return await buscarSKU(
        req,
        res,
        skuId
      );
    }

    // ==================================================
    // POST
    // ==================================================

    if (req.method === "POST") {

      return await registrarMovimentacao(
        req,
        res
      );
    }

    // ==================================================
    // MÉTODO NÃO PERMITIDO
    // ==================================================

    return send(res, 405, {
      error: "Método não permitido"
    });

  } catch (err) {

    console.error(
      "Erro geral API estoque:",
      err
    );

    return send(res, 500, {
      error: "Erro interno na API de estoque"
    });
  }
}
