import { pool } from "../lib/db.js";
import { formatarPedidoPayload } from "./util/formatarPedido.js";

const rateLimitMap = new Map();

function rateLimit(req, res, limit = 10, windowMs = 60000) {
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

function send(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.status(status).json(data);
}

export default async function handler(req, res) {

  if (req.method === "OPTIONS") {
    return send(res, 200, {});
  }

  // 🔐 RATE LIMIT
  if (!rateLimit(req, res)) {
    return send(res, 429, {
      error: "Você excedeu o limite de requisições. Tente novamente em instantes."
    });
  }


  if (req.method !== "POST") {
    return send(res, 405, { error: "Método não permitido" });
  }

  const client = await pool.connect();

  try {
    const payload = formatarPedidoPayload(req.body);

    const {
      cliente,
      endereco,
      itens,
      pagamento,
      frete,
      prazo,
      entrega,
      transportadora
    } = payload;

    // ============================
    // 🔒 VALIDAÇÕES BÁSICAS
    // ============================

    if (!cliente?.cpf || !cliente?.nome) {
      return send(res, 400, { error: "Cliente inválido" });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
      return send(res, 400, { error: "Itens inválidos" });
    }

    if (itens.length > 20) {
      return send(res, 400, { error: "Limite de itens excedido" });
    }

    if (!["pix", "cartao"].includes(pagamento)) {
      return send(res, 400, { error: "Pagamento inválido" });
    }

    // ============================
    // 🔥 TRANSACTION
    // ============================
    await client.query("BEGIN");

    // ============================
    // 🔥 CLIENTE
    // ============================
    let clienteId;

    const clienteExistente = await client.query(
      `SELECT id FROM clientes WHERE cpf = $1 LIMIT 1`,
      [cliente.cpf]
    );

    if (clienteExistente.rows.length > 0) {
      clienteId = clienteExistente.rows[0].id;
    } else {
      const novoCliente = await client.query(
        `INSERT INTO clientes (nome, email, whatsapp, cpf)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          cliente.nome,
          cliente.email || null,
          cliente.whatsapp || null,
          cliente.cpf
        ]
      );
      clienteId = novoCliente.rows[0].id;
    }

    // ============================
    // 🔥 PRODUTOS + TOTAL
    // ============================
    let total = 0;

    for (const item of itens) {

      if (!item.produto_id || item.quantidade <= 0 || item.quantidade > 50) {
        throw new Error("Item inválido");
      }

      const produto = await client.query(
        `SELECT preco FROM produtos WHERE id = $1`,
        [item.produto_id]
      );

      if (produto.rows.length === 0) {
        throw new Error(`Produto inválido: ${item.produto_id}`);
      }

      const preco = Number(produto.rows[0].preco);
      const subtotal = preco * item.quantidade;

      item.preco_unitario = preco;
      item.subtotal = subtotal;

      total += subtotal;
    }

    // ============================
    // 🔥 FRETE + DESCONTO
    // ============================
    const freteFinal = Number(frete) || 0;

    let desconto = 0;

    if (pagamento === "pix") {
      desconto = total * 0.05;
    }

    total = total + freteFinal - desconto;

    if (total <= 0) {
      throw new Error("Total inválido");
    }

    // ============================
    // 🔥 PEDIDO
    // ============================
    const pedido = await client.query(
      `INSERT INTO pedidos (
        pedido_codigo,
        cliente_id,
        rua, numero, complemento, bairro, cidade, estado, cep,
        entrega, pagamento, frete, prazo, status_pedido, status_pagamento, total, transportadora, whatsapp, nome_cliente, email_cliente, cpf_cliente
      )
      VALUES (
        $1, 
        $2,
        $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, 'aguardando_pagamento', 'pending', $14, $15, $16, $17, $18, $19
      )
      RETURNING id, pedido_codigo, nome_cliente`,
      [
        `PED-${Date.now()}`,
        clienteId,
        endereco?.rua || "",
        endereco?.numero || "",
        endereco?.complemento || "",
        endereco?.bairro || "",
        endereco?.cidade || "",
        endereco?.estado || "",
        endereco?.cep || "",
        entrega,
        pagamento,
        freteFinal,
        prazo || 0,
        total,
        transportadora || "",
        cliente.whatsapp || null,
        cliente.nome,
        cliente.email,
        cliente.cpf
      ]
    );

    const pedidoId = pedido.rows[0].id;
    const pedidoCodigo = pedido.rows[0].pedido_codigo;
    const nomeCliente = pedido.rows[0].nome_cliente;

    // ============================
    // 🔥 ITENS
    // ============================
    for (const item of itens) {
      await client.query(
        `INSERT INTO pedido_itens (
          pedido_id,
          produto_id,
          quantidade,
          preco_unitario,
          subtotal,
          personalizacao_txt,
          personalizacao_img,
          variacao
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          pedidoId,
          item.produto_id,
          item.quantidade,
          item.preco_unitario,
          item.subtotal,
          item.personalizacao_txt || null,
          item.personalizacao_img || null,
          item.variacao || null
        ]
      );
    }

    await client.query("COMMIT");

    return send(res, 200, {
      pedido_id: pedidoId,
      pedido_codigo: pedidoCodigo,
      nome_cliente: nomeCliente,
      total
    });

  } catch (err) {
    await client.query("ROLLBACK");

    console.error("Erro criar pedido:", err.message);

    return send(res, 500, {
      error: "Erro ao criar pedido"
    });

  } finally {
    client.release();
  }
}
