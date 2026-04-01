export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let body;
  try {
    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      body = {};
    }
    const destino = body;
    console.log(destino);           

    const origem = {
      postal_code: "06803290"
    };   


    const response = await fetch("https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
        "Accept": "application/json"
      },
      body: JSON.stringify({
        from: { origem },
        to: { postal_code: destino },
        package: {
          height: 4,
          width: 15,
          length: 20,
          weight: 0.3
        }
      })
    });

    const data = await response.json();
    if (!data.length) {
      throw new Error("Sem opções de frete");
    }

    // 🔥 pegar opção mais barata
    const melhor = data.reduce((prev, curr) =>
      Number(curr.price) < Number(prev.price) ? curr : prev
    );

    return res.status(200).json({
      valor: Number(melhor.price),
      prazo: melhor.delivery_time
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao calcular frete" });
  }
}
