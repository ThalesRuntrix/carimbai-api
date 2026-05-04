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
    
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Sem opções de frete");
    }

    // 🔥 filtrar apenas opções válidas
    const validos = data.filter(op => op.price && !op.error);

    // 🔥 ordenar por preço (crescente)
    const ordenadosPorPreco = [...validos].sort(
      (a, b) => Number(a.price) - Number(b.price)
    );

    // 🔥 ordenar por prazo (crescente)
    const ordenadosPorPrazo = [...validos].sort(
      (a, b) => Number(a.delivery_time) - Number(b.delivery_time)
    );

    // 🔥 pegar opções estratégicas
    const maisBarato = ordenadosPorPreco[0];
    const segundoMaisBarato = ordenadosPorPreco[1];
    const maisRapido = ordenadosPorPrazo[0];

    // 🔥 evitar duplicados
    const opcoesSelecionadas = [];
    const ids = new Set();

    [maisBarato, segundoMaisBarato, maisRapido].forEach(op => {
      if (op && !ids.has(op.id)) {
        ids.add(op.id);
        opcoesSelecionadas.push(op);
      }
    });

    return res.status(200).json(
      opcoesSelecionadas.map(op => ({
        id: op.id,
        nome: op.name,
        empresa: op.company.name,
        valor: Number(op.price),
        prazo: op.delivery_time
      }))
    );

  } catch (err) {
    console.error("ERRO FRETE:", err);

    return res.status(500).json({
      error: "Erro ao calcular frete"
    });
  }
}
