import pool from "../lib/db.js";

export default async function handler(req, res) {
  try {
    const result = await pool.query("SELECT 1");
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("ERRO REAL:", err);
    res.status(500).json({ error: err.message });
  }
}