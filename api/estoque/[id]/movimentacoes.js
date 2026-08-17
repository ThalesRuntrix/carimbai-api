import { pool } from "../../../lib/db.js";

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
      ORDER BY me.created_at DESC, me.id DESC
      `,
      [Number(id)]
    );

    return send(res, 200, result.rows);

  } catch (err) {

    console.error(
      "Erro ao buscar movimentações:",
      err
    );

    return send(res, 500, {
      error: "Erro ao buscar movimentações"
    });
  }
}

