export async function enviarTelegram(mensagem) {
  try {    

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    console.log("TOKEN:", token ? "OK" : "UNDEFINED");    

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: mensagem,
        parse_mode: "HTML"
      })
    });

    const data = await response.json();

    console.log("📩 Telegram response:", data);

  } catch (error) {
    console.error("❌ Erro Telegram:", error);
  }
}
