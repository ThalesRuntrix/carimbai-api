export default async function handler(req, res) {
  // CORS
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

    // limpa telefone
    const numero = telefone.replace(/\D/g, "");

    // Brasil com DDI
    const phone =
      numero.startsWith("55")
        ? numero
        : `55${numero}`;

    const mensagem =
`Olá ${nome || "cliente"} 👋

Recebemos o pagamento do seu pedido *${pedido_codigo}* ✅

Agora envie por aqui as informações que serão gravadas no produto.

Se preferir, pode mandar foto, logo ou arte.

Obrigado pela compra 🙏`;

    const response = await fetch(
      `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body: mensagem
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);

      return res.status(500).json({
        error: "Erro ao enviar WhatsApp",
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
