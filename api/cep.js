// /api/cep.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const { cep } = body;

    if (!cep || cep.length !== 8) {
      return res.status(400).json({ error: "CEP inválido" });
    }

    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();

    if (data.erro) {
      return res.status(404).json({ error: "CEP não encontrado" });
    }

    return res.status(200).json({
      rua: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf
    });

  } catch (err) {
    console.error("ERRO CEP:", err);
    return res.status(500).json({ error: "Erro ao buscar CEP" });
  }
}