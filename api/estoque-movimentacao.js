import { pool } from "../lib/db.js";

function send(res, status, data) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://runtrix.com.br"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST,OPTIONS"
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

  if (req.method !== "POST") {
    return send(res, 405, {
      error: "Método não permitido"
    });
  }

  try {

    const {
      produto_sku_id,
      tipo,
      quantidade,
      estoque_final,
      motivo,
      observacao,
      pedido_id
    } = req.body || {};

    // ============================
    // VALIDAÇÃO SKU
    // ============================

    if (
      !produto_sku_id ||
      !Number.isInteger(Number(produto_sku_id))
    ) {
      return send(res, 400, {
        error: "produto_sku_id inválido"
      });
    }

    // ============================
    // VALIDAÇÃO TIPO
    // ============================

    if (!["entrada", "saida", "ajuste"].includes(tipo)) {
      return send(res, 400, {
        error: "Tipo de movimentação inválido"
      });
    }

    // ============================
    // VALIDAÇÃO ENTRADA / SAÍDA
    // ============================

    if (tipo === "entrada" || tipo === "saida") {

      if (
        quantidade === undefined ||
        quantidade === null ||
        !Number.isInteger(Number(quantidade)) ||
        Number(quantidade) <= 0
      ) {
        return send(res, 400, {
          error: "Quantidade inválida"
        });
      }
    }

    // ============================
    // VALIDAÇÃO AJUSTE
    // ============================

    if (tipo === "ajuste") {

      if (
        estoque_final === undefined ||
        estoque_final === null ||
        !Number.isInteger(Number(estoque_final)) ||
        Number(estoque_final) < 0
      ) {
        return send(res, 400, {
          error: "Estoque final inválido"
        });
      }
    }

    // ============================
    // CHAMA FUNÇÃO TRANSACIONAL
    // ============================

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
        Number(produto_sku_id),
        tipo,
        quantidade !== undefined && quantidade !== null
          ? Number(quantidade)
          : null,
        estoque_final !== undefined && estoque_final !== null
          ? Number(estoque_final)
          : null,
        motivo || null,
        observacao || null,
        pedido_id
          ? Number(pedido_id)
          : null
      ]
    );

    return send(res, 200, result.rows[0]);

  } catch (err) {

    console.error(
      "Erro ao registrar movimentação:",
      err
    );

    // Erros de regra de negócio
    if (
      err.message?.includes("Estoque insuficiente") ||
      err.message?.includes("não encontrado") ||
      err.message?.includes("não altera") ||
      err.message?.includes("Tipo de movimentação") ||
      err.message?.includes("quantidade") ||
      err.message?.includes("estoque final")
    ) {
      return send(res, 400, {
        error: err.message
      });
    }

    return send(res, 500, {
      error: "Erro ao registrar movimentação"
    });
  }
}
