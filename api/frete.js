export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // 🔥 parse body seguro
    let body;
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      body = {};
    }

    const { cep } = body;

    console.log("CEP recebido:", cep);

    // 🔥 validação
    if (!cep || cep.length !== 8) {
      return res.status(400).json({ error: "CEP inválido" });
    }

    // 🔥 chamada correta da API
    const response = await fetch(
      "https://melhorenvio.com.br/api/v2/me/shipment/calculate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          "Accept": "application/json"
        },
        body: JSON.stringify({
          from: {
            postal_code: "06803290" // 🔥 seu CEP (origem)
          },
          to: {
            postal_code: cep // 🔥 CEP do cliente
          },
          package: {
            height: 4,
            width: 15,
            length: 20,
            weight: 0.3
          }
        })
      }
    );

    const data = await response.json();

    console.log("RESPOSTA MELHOR ENVIO:", data);

    // 🔥 tratamento de erro real
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Sem opções de frete");
    }

    // 🔥 filtrar apenas opções válidas
    const opcoesValidas = data.filter(item => item.price && !item.error);

    if (!opcoesValidas.length) {
      throw new Error("Nenhuma opção válida");
    }

    // 🔥 pegar mais barato
    const melhor = opcoesValidas.reduce((prev, curr) =>
      Number(curr.price) < Number(prev.price) ? curr : prev
    );

    return res.status(200).json({
      valor: Number(melhor.price),
      prazo: melhor.delivery_time
    });

  } catch (err) {
    console.error("ERRO FRETE:", err);

    return res.status(500).json({
      error: "Erro ao calcular frete"
    });
  }
}
