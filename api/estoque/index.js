import { pool } from "../../lib/db.js";

function send(res, status, data) {
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

  return res.status(status).json(data);
}

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    return send(res, 200, {});
  }

  if (req.method !== "GET") {
    return send(res, 405, {
      error: "Método não permitido"
    });
  }

  try {

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

    // ============================
    // BUSCA
    // ============================

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

    // ============================
    // ATIVO
    // ============================

    if (ativo === "true" || ativo === "false") {

      sql += `
        AND ps.ativo = $${paramIndex}
      `;

      params.push(ativo === "true");
      paramIndex++;
    }

    // ============================
    // BAIXO ESTOQUE
    // ============================

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

  } catch (err) {

    console.error("Erro ao buscar estoque:", err);

    return send(res, 500, {
      error: "Erro ao buscar estoque"
    });
  }
}
