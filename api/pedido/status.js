export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { id } = req.query;

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}&select=status_pagamento`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        }
      }
    );

    const data = await response.json();

    return res.status(200).json(data[0]);

  } catch (err) {
    return res.status(500).json({ error: "erro status" });
  }
}
