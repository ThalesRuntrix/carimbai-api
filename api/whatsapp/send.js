export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { telefone, nome, pedido_codigo } = req.body;

    if (!telefone) {
      return res.status(400).json({
        error: "Telefone obrigatório"
      });
    }

    const numero = telefone.replace(/\D/g, "");

    const phone =
      numero.startsWith("55")
        ? numero
        : `55${numero}`;

    const response = await fetch(
      `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "template",
          template: {
            name: "pedido_confirmado",
            language: {
              code: "pt_BR"
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: nome || "Cliente"
                  },
                  {
                    type: "text",
                    text: pedido_codigo
                  }
                ]
              }
            ]
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);

      return res.status(500).json({
        error: "Erro WhatsApp",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro interno"
    });
  }
}
