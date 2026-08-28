/*import pool from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://runtrix.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 🔒 AUTH ADMIN
  const authHeader = req.headers.authorization;

  if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    console.warn("Tentativa não autorizada de criar produto");
    return res.status(401).json({ error: "unauthorized" });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (req.headers.origin !== "https://runtrix.com.br") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { nome, categoria_id, preco, detalhes } = req.body;

    // 🔒 VALIDAÇÃO
    if (!nome || !categoria_id || !preco) {
      return res.status(400).json({
        error: "Campos obrigatórios: nome, categoria_id, preco"
      });
    }

    if (typeof preco !== "number" || preco <= 0) {
      return res.status(400).json({
        error: "Preço inválido"
      });
    }

    // =========================
    // INSERT PRODUTO
    // =========================
    const produto = await pool.query(
      `INSERT INTO produtos (nome, categoria_id, preco)
       VALUES ($1, $2, $3) RETURNING *`,
      [nome, categoria_id, preco] // ✅ corrigido
    );

    const produtoId = produto.rows[0].id;

    // =========================
    // DETALHES POR CATEGORIA
    // =========================

    // 🟢 CARIMBO
    if (categoria_id === 1 && detalhes) {
      await pool.query(
        `INSERT INTO carimbos (produto_id, marca, modelo, medida, tipo_material)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          produtoId,
          detalhes.marca || null,
          detalhes.modelo || null,
          detalhes.medida || null,
          detalhes.tipo_material || null
        ]
      );
    }

    // 🟢 CARTÃO (exemplo categoria 2)
    if (categoria_id === 2 && detalhes) {
      await pool.query(
        `INSERT INTO cartoes (produto_id, medida, tipo_material)
         VALUES ($1, $2, $3)`,
        [
          produtoId,
          detalhes.medida || null,
          detalhes.tipo_material || null
        ]
      );
    }

    return res.status(201).json({
      success: true,
      produtoId
    });

  } catch (err) {
    console.error("ERRO CREATE PRODUTO:", err);

    return res.status(500).json({
      error: "Erro interno"
    });
  }
}
*/