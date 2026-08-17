import { pool } from "../lib/db.js";

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

    const { id } = req.query;

    if (!id || !Number.isInteger(Number(id))) {
      return send(res, 400, {
        error: "ID do SKU inválido"
      });
    }

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
      [Number(id)]
    );

    if (result.rows.length === 0) {
      return send(res, 404, {
        error: "SKU não encontrado"
      });
    }

    return send(res, 200, result.rows[0]);

  } catch (err) {

    console.error("Erro ao buscar SKU:", err);

    return send(res, 500, {
      error: "Erro ao buscar SKU"
    });
  }
}
