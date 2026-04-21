import { pool } from "../lib/db.js";
import { formatarPedidoPayload } from "./util/formatarPedido.js";

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

  if (req.method !== "POST") {
    return send(res, 405, { error: "Método não permitido" });
  }

  const client = await pool.connect();

  try {
    const payload = formatarPedidoPayload(req.body);
    const { cliente, endereco, itens, pagamento, frete, prazo, entrega, transportadora } = payload;

    await client.query("BEGIN");

    // ============================
    // 🔥 1. CLIENTE
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
        `INSERT INTO clientes (nome, email, cpf)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [cliente.nome, cliente.email, cliente.cpf]
      );
      clienteId = novoCliente.rows[0].id;
    }

    // ============================
    // 🔥 2. PRODUTOS + TOTAL
    // ============================
    let total = 0;

    for (const item of itens) {
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

    let desconto = 0;

    // 💰 desconto PIX
    if (pagamento === "pix") {
      desconto = total * 0.05;      
    }
    total += frete - desconto || 0;
    

    // ============================
    // 🔥 3. PEDIDO
    // ============================
    const pedido = await client.query(
      `INSERT INTO pedidos (
        pedido_codigo,
        cliente_id,
        rua, numero, complemento, bairro, cidade, estado, cep,
        entrega, pagamento, frete, prazo, status, total, transportadora
      )
      VALUES (
        $1, $2,
        $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, 'pending', $14, $15
      )
      RETURNING id`,
      [
        `PED-${Date.now()}`,
        clienteId,
        endereco.rua,
        endereco.numero,
        endereco.complemento,
        endereco.bairro,
        endereco.cidade,
        endereco.estado,
        endereco.cep,
        entrega,
        pagamento,
        frete || 0,
        prazo || 0,
        total,
        transportadora
      ]
    );

    const pedidoId = pedido.rows[0].id;

    // ============================
    // 🔥 4. ITENS
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
          personalizacao_img
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          pedidoId,
          item.produto_id,
          item.quantidade,
          item.preco_unitario,
          item.subtotal,
          item.personalizacao_txt,
          item.personalizacao_img
        ]
      );
    }

    // ============================
    // 🔥 COMMIT
    // ============================
    await client.query("COMMIT");

    return send(res, 200, {
      success: true,
      pedido_id: pedidoId,
      total
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);

    return send(res, 500, {
      error: err.message
    });

  } finally {
    client.release();
  }
}