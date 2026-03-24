import pool from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { categoria, search, page = 1, limit = 12 } = req.query;

    let query = `
      SELECT 
        p.id,
        p.nome,
        p.preco,
        c.nome AS categoria
      FROM produtos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
    `;

    const values = [];

    if (categoria) {
      values.push(categoria);
      query += ` WHERE p.categoria_id = $${values.length}`;
    }

    if (search) {
      values.push(`%${search}%`);
      query += values.length === 1
        ? ` WHERE p.nome ILIKE $${values.length}`
          : ` AND p.nome ILIKE $${values.length}`;
    }

    const offset = (page - 1) * limit;

    values.push(limit);
    values.push(offset);

    query += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;

    const { rows } = await pool.query(query, values);

    res.status(200).json(rows);
  } catch (err) {
    console.error("ERRO COMPLETO:", err);
    res.status(500).json({ error: err.message || "Erro desconhecido" });
  }
}
