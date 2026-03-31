export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { cep } = req.body;
    
    const origem = {
      postal_code: "06803290" // seu CEP
    };

    const destino = {
      postal_code: cep
    };

    const body = {
      from: origem,
      to: destino,

      products: [
        {
          id: "1",
          width: 15,
          height: 5,
          length: 20,
          weight: 0.3,
          insurance_value: 50,
          quantity: 1
        }
      ]
    };

    const response = await fetch(
      "https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          Accept: "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    // 🔥 pegar opção mais barata
    const melhorOpcao = data.reduce((prev, curr) =>
      Number(curr.price) < Number(prev.price) ? curr : prev
    );

    res.status(200).json({
      nome: melhorOpcao.name,
      valor: Number(melhorOpcao.price),
      prazo: melhorOpcao.delivery_time
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao calcular frete" });
  }
}
