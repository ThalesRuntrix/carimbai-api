import pool from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { nome, categoria, preco, detalhes } = req.body;

    const produto = await pool.query(
      `INSERT INTO produtos (nome, categoria, preco)
       VALUES ($1, $2, $3) RETURNING *`,
      [nome, categoria, preco]
    );

    const produtoId = produto.rows[0].id;

    if (categoria === 'carimbo') {
      await pool.query(
        `INSERT INTO carimbos (produto_id, marca, modelo, cor, medida)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          produtoId,
          detalhes.marca,
          detalhes.modelo,
          detalhes.cor,
          detalhes.medida
        ]
      );
    }

    if (categoria === 'cartao') {
      await pool.query(
        `INSERT INTO cartoes (produto_id, medida, tipo_material, cor)
         VALUES ($1, $2, $3, $4)`,
        [
          produtoId,
          detalhes.medida,
          detalhes.tipo_material,
          detalhes.cor
        ]
      );
    }

    res.status(201).json({ success: true, produtoId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}