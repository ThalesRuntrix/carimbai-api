import pool from '../../lib/db,js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id } = req.query;

  try {
    const produto = await pool.query(
      `
      SELECT 
        p.id,
        p.nome,
        p.preco,
        p.categoria_id,
        c.nome AS categoria
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = $1
      `,
      [id]
    );

    if (produto.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const data = produto.rows[0];

    let detalhes = {};

    if (data.categoria === 'carimbo') {
      const result = await pool.query(
        'SELECT * FROM carimbos WHERE produto_id = $1',
        [id]
      );
      detalhes = result.rows[0] || {};
    }

    if (data.categoria === 'cartao') {
      const result = await pool.query(
        'SELECT * FROM cartoes WHERE produto_id = $1',
        [id]
      );
      detalhes = result.rows[0] || {};
    }

    res.status(200).json({ ...data, detalhes });
  } catch (err) {
    console.error("ERRO COMPLETO:", err);
    res.status(500).json({ error: err.message || "Erro desconhecido" });
    
  }
}