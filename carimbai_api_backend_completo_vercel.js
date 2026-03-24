// =========================
// 📦 package.json
// =========================
{
  "name": "carimbai-api",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "pg": "^8.11.3"
  }
}


// =========================
// 📁 /lib/db.js
// =========================
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default pool;


// =========================
// 📁 /api/produtos.js (GET todos)
// =========================
import pool from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { categoria, search, page = 1, limit = 12 } = req.query;

    let query = 'SELECT * FROM produtos';
    const values = [];

    if (categoria) {
      values.push(categoria);
      query += ` WHERE categoria = $${values.length}`;
    }

    if (search) {
      values.push(`%${search}%`);
      query += values.length === 1
        ? ` WHERE nome ILIKE $${values.length}`
        : ` AND nome ILIKE $${values.length}`;
    }

    const offset = (page - 1) * limit;

    values.push(limit);
    values.push(offset);

    query += ` LIMIT $${values.length - 1} OFFSET $${values.length}`;

    const { rows } = await pool.query(query, values);

    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


// =========================
// 📁 /api/produto/[id].js (GET por ID)
// =========================
import pool from '../../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { id } = req.query;

  try {
    const produto = await pool.query(
      'SELECT * FROM produtos WHERE id = $1',
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
    res.status(500).json({ error: err.message });
  }
}


// =========================
// 📁 /api/produto/create.js (POST criar produto)
// =========================
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


// =========================
// 📁 schema.sql (RODAR NO SUPABASE)
// =========================

/*
CREATE TABLE produtos (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  preco NUMERIC NOT NULL
);

CREATE TABLE carimbos (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
  marca TEXT,
  modelo TEXT,
  cor TEXT,
  medida TEXT
);

CREATE TABLE cartoes (
  id SERIAL PRIMARY KEY,
  produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
  medida TEXT,
  tipo_material TEXT,
  cor TEXT
);
*/


// =========================
// 🚀 COMO USAR
// =========================

/*
1. Subir no GitHub
2. Importar projeto na Vercel
3. Adicionar ENV:
   DATABASE_URL=postgres://...

4. Testar:
   GET /api/produtos
   GET /api/produto/1
   POST /api/produto/create
*/
