// ============================
// RATE LIMIT
// ============================
const rateLimitMap = new Map();

function rateLimit(req, limit = 30, windowMs = 60000) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip);

  const recent = timestamps.filter(
    (t) => now - t < windowMs
  );

  if (recent.length >= limit) {
    return false;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);

  return true;
}

// ============================
// VALIDA ORIGEM
// ============================
function validarOrigem(req) {
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const permitido = "https://runtrix.com.br";

  if (
    (origin && origin.startsWith(permitido)) ||
    (referer && referer.startsWith(permitido))
  ) {
    return true;
  }

  return false;
}

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 🔐 Só GET
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  // 🔐 Valida origem
  if (!validarOrigem(req)) {
    return res.status(403).json({
      error: "Forbidden"
    });
  }

  // 🔐 Rate limit
  if (!rateLimit(req, 20, 60000)) {
    return res.status(429).json({
      error: "Muitas requisições"
    });
  }

  const { id } = req.query;

  // 🔐 Validação forte do ID
  if (!id || isNaN(id) || Number(id) <= 0) {
    return res.status(400).json({
      error: "ID inválido"
    });
  }

  try {

    // 🔐 Timeout simples (3s)
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 3000);

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${id}&select=status_pagamento`,
      {
        headers: {
          apikey: process.env.SUPABASE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_KEY}`
        },
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    const data = await response.json();

    // 🔐 Anti-enumeração
    if (!data || data.length === 0) {
      return res.status(200).json({
        status_pagamento: "not_found"
      });
    }

    return res.status(200).json({
      status_pagamento: data[0].status_pagamento
    });

  } catch (err) {
    console.error("Erro status:", err?.message);

    return res.status(500).json({
      error: "erro status"
    });
  }
}
