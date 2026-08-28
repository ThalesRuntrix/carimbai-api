import { pool } from "../lib/db.js";
import { formatarPedidoPayload } from "./util/formatarPedido.js";

const rateLimitMap = new Map();


// ============================================================
// RATE LIMIT
// ============================================================

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


// ============================================================
// RESPONSE / CORS
// ============================================================

function send(res, status, data) {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://runtrix.com.br"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,PATCH,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Backoffice-Password"
  );

  return res.status(status).json(data);
}


// ============================================================
// AUTENTICAÇÃO BACKOFFICE
// ============================================================

function verificarSenhaBackoffice(req) {

  const senha =
    req.headers["x-backoffice-password"];

  return (
    senha &&
    senha === process.env.BACKOFFICE_PASSWORD
  );
}


// ============================================================
// GET — LISTAR PEDIDOS
// ============================================================

async function listarPedidos(req, res) {

  const {
    busca = "",
    status_pedido = "",
    status_pagamento = ""
  } = req.query || {};

  const valores = [];
  const where = [];

  // ==========================================================
  // BUSCA
  // ==========================================================

  if (busca.trim()) {

    valores.push(`%${busca.trim()}%`);

    const parametro = `$${valores.length}`;

    where.push(`
      (
        pedido_codigo ILIKE ${parametro}
        OR nome_cliente ILIKE ${parametro}
        OR email_cliente ILIKE ${parametro}
        OR cpf_cliente ILIKE ${parametro}
        OR whatsapp ILIKE ${parametro}
      )
    `);
  }


  // ==========================================================
  // STATUS DO PEDIDO
  // ==========================================================

  if (status_pedido) {

    valores.push(status_pedido);

    where.push(
      `status_pedido = $${valores.length}`
    );
  }


  // ==========================================================
  // STATUS DO PAGAMENTO
  // ==========================================================

  if (status_pagamento) {

    valores.push(status_pagamento);

    where.push(
      `status_pagamento = $${valores.length}`
    );
  }


  // ==========================================================
  // WHERE
  // ==========================================================

  const whereSQL =
    where.length
      ? `WHERE ${where.join(" AND ")}`
      : "";


  // ==========================================================
  // SELECT
  //
  // NÃO RETORNAR:
  // id
  // created_at
  // cliente_id
  // pix_codigo
  // pix_qr_code
  // mp_preference_id
  // external_reference
  // mp_status_detail
  // mp_payment_type
  // mp_payment_method
  // ==========================================================

  const query = `
    SELECT
      pedido_codigo,

      rua,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,

      entrega,
      pagamento,

      total,
      frete,
      prazo,

      transportadora,

      status_pagamento,
      status_pedido,

      mp_payment_id,

      paid_at,
      shipped_at,
      delivered_at,
      cancelled_at,

      observacoes,
      whatsapp,

      mp_status,
      mp_date_approved,

      nome_cliente,
      email_cliente,
      cpf_cliente,

      mp_transaction_amount,
      mp_authorization_code,
      mp_payer_email

    FROM pedidos

    ${whereSQL}

    ORDER BY
      pedido_codigo DESC
  `;


  try {

    const result =
      await pool.query(
        query,
        valores
      );

    return send(
      res,
      200,
      result.rows
    );

  } catch (err) {

    console.error(
      "Erro listar pedidos:",
      err
    );

    return send(
      res,
      500,
      {
        error: "Erro ao listar pedidos"
      }
    );
  }
}


// ============================================================
// GET — LISTAR PEDIDO_ITENS
// ============================================================

async function listarPedidoItens(req, res) {

  const pedidoCodigo =
    String(req.query?.pedido_codigo || "").trim();

  if (!pedidoCodigo) {

    return send(
      res,
      400,
      {
        error: "pedido_codigo inválido"
      }
    );
  }

  try {

    const result =
      await pool.query(
        `
          SELECT
            pedido_id,
            produto_id,
            quantidade,
            preco_unitario,
            subtotal,
            personalizacao_txt,
            personalizacao_img,
            variacao,
            produto_sku_id

          FROM pedido_itens

          WHERE pedido_id = (
            SELECT id
            FROM pedidos
            WHERE pedido_codigo = $1
          )

          ORDER BY id ASC
        `,
        [pedidoCodigo]
      );

    return send(
      res,
      200,
      result.rows
    );

  } catch (err) {

    console.error(
      "Erro listar pedido_itens:",
      err
    );

    return send(
      res,
      500,
      {
        error:
          "Erro ao listar itens do pedido"
      }
    );
  }
}


// ============================================================
// PATCH — EDITAR PEDIDO + ITENS
// ============================================================

async function editarPedido(req, res) {

  const body =
    req.body || {};


  const pedidoCodigo =
  String(body.pedido_codigo || "").trim();

  if (!pedidoCodigo) {

    return send(
      res,
      400,
      {
        error: "pedido_codigo inválido"
      }
    );
  }


  // ==========================================================
  // CAMPOS PERMITIDOS — PEDIDOS
  // ==========================================================

  const pedido =
    body.pedido || {};


  const statusPermitidos = [
    "novo",
    "aguardando_pagamento",
    "producao",
    "pronto",
    "enviado",
    "entregue",
    "cancelado"
  ];


  if (
    pedido.status_pedido !== undefined &&
    !statusPermitidos.includes(
      pedido.status_pedido
    )
  ) {

    return send(
      res,
      400,
      {
        error: "status_pedido inválido"
      }
    );
  }


  // ==========================================================
  // MONTA UPDATE DINÂMICO
  // ==========================================================

  const camposPedido = [];
  const valoresPedido = [];


  if (
    pedido.status_pedido !== undefined
  ) {

    valoresPedido.push(
      pedido.status_pedido
    );

    camposPedido.push(
      `status_pedido = $${valoresPedido.length}`
    );
  }


  if (
    pedido.shipped_at !== undefined
  ) {

    valoresPedido.push(
      pedido.shipped_at || null
    );

    camposPedido.push(
      `shipped_at = $${valoresPedido.length}`
    );
  }


  if (
    pedido.delivered_at !== undefined
  ) {

    valoresPedido.push(
      pedido.delivered_at || null
    );

    camposPedido.push(
      `delivered_at = $${valoresPedido.length}`
    );
  }


  if (
    pedido.observacoes !== undefined
  ) {

    valoresPedido.push(
      pedido.observacoes || null
    );

    camposPedido.push(
      `observacoes = $${valoresPedido.length}`
    );
  }


  // ==========================================================
  // ITENS
  // ==========================================================

  const itens =
    Array.isArray(body.itens)
      ? body.itens
      : [];


  // ==========================================================
  // GARANTE QUE EXISTE ALGUMA ALTERAÇÃO
  // ==========================================================

  if (
    camposPedido.length === 0 &&
    itens.length === 0
  ) {

    return send(
      res,
      400,
      {
        error: "Nenhuma alteração informada"
      }
    );
  }


  // ==========================================================
  // VALIDA ITENS
  // ==========================================================

  for (const item of itens) {

    const pedidoItemId =
      Number(item.pedido_item_id);


    if (
      !Number.isInteger(pedidoItemId) ||
      pedidoItemId <= 0
    ) {

      return send(
        res,
        400,
        {
          error:
            "pedido_item_id inválido"
        }
      );
    }


    // --------------------------------------------------------
    // Somente estes dois campos podem ser alterados
    // --------------------------------------------------------

    const camposPermitidos =
      [
        "personalizacao_txt",
        "personalizacao_img"
      ];


    const possuiCampoEditavel =
      camposPermitidos.some(
        campo =>
          item[campo] !== undefined
      );


    if (!possuiCampoEditavel) {

      return send(
        res,
        400,
        {
          error:
            `Nenhuma alteração válida informada para o pedido_item_id ${pedidoItemId}`
        }
      );
    }
  }


  // ==========================================================
  // TRANSACTION
  // ==========================================================

  const client =
    await pool.connect();


  try {

    await client.query("BEGIN");


    // ========================================================
    // VERIFICA SE O PEDIDO EXISTE
    // ========================================================

    const pedidoExiste =
      await client.query(
        `
          SELECT
            id,
            pedido_codigo
          FROM pedidos
          WHERE pedido_codigo = $1
          FOR UPDATE
        `,
        [pedidoCodigo]
      );


    if (
      pedidoExiste.rows.length === 0
    ) {

      await client.query("ROLLBACK");

      return send(
        res,
        404,
        {
          error: "Pedido não encontrado"
        }
      );
    }
    
    const pedidoId =
      pedidoExiste.rows[0].id;


    // ========================================================
    // UPDATE PEDIDO
    // ========================================================

    if (camposPedido.length > 0) {

      valoresPedido.push(
        pedidoId
      );


      await client.query(
        `
          UPDATE pedidos

          SET
            ${camposPedido.join(", ")}

          WHERE id = $${valoresPedido.length}
        `,
        valoresPedido
      );
    }


    // ========================================================
    // UPDATE PEDIDO_ITENS
    // ========================================================

    for (const item of itens) {

      const pedidoItemId =
        Number(
          item.pedido_item_id
        );


      const camposItem = [];
      const valoresItem = [];


      if (
        item.personalizacao_txt !== undefined
      ) {

        valoresItem.push(
          item.personalizacao_txt || null
        );

        camposItem.push(
          `personalizacao_txt = $${valoresItem.length}`
        );
      }


      if (
        item.personalizacao_img !== undefined
      ) {

        valoresItem.push(
          item.personalizacao_img || null
        );

        camposItem.push(
          `personalizacao_img = $${valoresItem.length}`
        );
      }


      // ------------------------------------------------------
      // Segurança:
      // garante que o item pertence ao pedido
      // ------------------------------------------------------

      valoresItem.push(
        pedidoItemId
      );

      valoresItem.push(
        pedidoId
      );


      const parametroItem =
        `$${valoresItem.length - 1}`;

      const parametroPedido =
        `$${valoresItem.length}`;


      const resultadoItem =
        await client.query(
          `
            UPDATE pedido_itens

            SET
              ${camposItem.join(", ")}

            WHERE
              id = ${parametroItem}
              AND pedido_id = ${parametroPedido}

            RETURNING
              pedido_id,
              produto_id,
              quantidade,
              preco_unitario,
              subtotal,
              personalizacao_txt,
              personalizacao_img,
              variacao,
              produto_sku_id
          `,
          valoresItem
        );


      if (
        resultadoItem.rows.length === 0
      ) {

        throw new Error(
          `Pedido item não encontrado: ${pedidoItemId}`
        );
      }
    }


    // ========================================================
    // COMMIT
    // ========================================================

    await client.query("COMMIT");


    // ========================================================
    // RETORNO
    // ========================================================

    const pedidoAtualizado =
      await client.query(
        `
          SELECT
            pedido_codigo,
            rua,
            numero,
            complemento,
            bairro,
            cidade,
            estado,
            cep,
            entrega,
            pagamento,
            total,
            frete,
            prazo,
            transportadora,
            status_pagamento,
            status_pedido,
            mp_payment_id,
            paid_at,
            shipped_at,
            delivered_at,
            cancelled_at,
            observacoes,
            whatsapp,
            mp_status,
            mp_date_approved,
            nome_cliente,
            email_cliente,
            cpf_cliente,
            mp_transaction_amount,
            mp_authorization_code,
            mp_payer_email

          FROM pedidos

          WHERE id = $1
        `,
        [pedidoId]
      );


    return send(
      res,
      200,
      {
        message:
          "Pedido atualizado com sucesso",

        pedido:
          pedidoAtualizado.rows[0]
      }
    );


  } catch (err) {

    await client.query(
      "ROLLBACK"
    );


    console.error(
      "Erro editar pedido:",
      err
    );


    return send(
      res,
      500,
      {
        error:
          "Erro ao editar pedido"
      }
    );


  } finally {

    client.release();
  }
}


// ============================================================
// POST — CRIAÇÃO DE PEDIDO PELO SITE
//
// IMPORTANTE:
// ESTA PARTE MANTÉM O FLUXO ATUAL.
// ============================================================

async function criarPedido(req, res) {

  // ==========================================================
  // RATE LIMIT
  // ==========================================================

  if (!rateLimit(req, res)) {

    return send(
      res,
      429,
      {
        error:
          "Você excedeu o limite de requisições. Tente novamente em instantes."
      }
    );
  }


  const client =
    await pool.connect();


  try {

    const payload =
      formatarPedidoPayload(
        req.body
      );


    console.log(
      "PAYLOAD FORMATADO:",
      JSON.stringify(
        payload,
        null,
        2
      )
    );


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


    // ========================================================
    // VALIDAÇÕES BÁSICAS
    // ========================================================

    if (
      !cliente?.cpf ||
      !cliente?.nome
    ) {

      return send(
        res,
        400,
        {
          error:
            "Cliente inválido"
        }
      );
    }


    if (
      !Array.isArray(itens) ||
      itens.length === 0
    ) {

      return send(
        res,
        400,
        {
          error:
            "Itens inválidos"
        }
      );
    }


    if (
      itens.length > 20
    ) {

      return send(
        res,
        400,
        {
          error:
            "Limite de itens excedido"
        }
      );
    }


    if (
      !["pix", "cartao"].includes(
        pagamento
      )
    ) {

      return send(
        res,
        400,
        {
          error:
            "Pagamento inválido"
        }
      );
    }


    // ========================================================
    // TRANSACTION
    // ========================================================

    await client.query(
      "BEGIN"
    );


    // ========================================================
    // CLIENTE
    // ========================================================

    let clienteId;


    const clienteExistente =
      await client.query(
        `
          SELECT id
          FROM clientes
          WHERE cpf = $1
          LIMIT 1
        `,
        [cliente.cpf]
      );


    if (
      clienteExistente.rows.length > 0
    ) {

      clienteId =
        clienteExistente.rows[0].id;

    } else {

      const novoCliente =
        await client.query(
          `
            INSERT INTO clientes (
              nome,
              email,
              whatsapp,
              cpf
            )

            VALUES (
              $1,
              $2,
              $3,
              $4
            )

            RETURNING id
          `,
          [
            cliente.nome,
            cliente.email || null,
            cliente.whatsapp || null,
            cliente.cpf
          ]
        );


      clienteId =
        novoCliente.rows[0].id;
    }


    // ========================================================
    // PRODUTOS + SKU + TOTAL
    // ========================================================

    let total = 0;


    for (
      const item of itens
    ) {

      // ======================================================
      // VALIDAÇÃO BÁSICA
      // ======================================================

      if (
        !item.produto_id ||
        !Number.isInteger(
          Number(item.produto_id)
        ) ||
        !item.produto_sku_id ||
        !Number.isInteger(
          Number(item.produto_sku_id)
        ) ||
        item.quantidade <= 0 ||
        item.quantidade > 50
      ) {

        throw new Error(
          "Item inválido"
        );
      }


      const produtoId =
        Number(
          item.produto_id
        );


      const skuId =
        Number(
          item.produto_sku_id
        );


      const quantidade =
        Number(
          item.quantidade
        );


      // ======================================================
      // BLOQUEIA O SKU
      // ======================================================

      const skuResult =
        await client.query(
          `
            SELECT
              ps.id,
              ps.produto_id,
              ps.estoque,
              ps.estoque_reservado,
              ps.preco AS sku_preco,
              ps.ativo,
              p.preco AS produto_preco

            FROM produto_skus ps

            INNER JOIN produtos p
              ON p.id = ps.produto_id

            WHERE
              ps.id = $1
              AND ps.produto_id = $2

            FOR UPDATE OF ps
          `,
          [
            skuId,
            produtoId
          ]
        );


      if (
        skuResult.rows.length === 0
      ) {

        throw new Error(
          `SKU inválido para o produto id: ${produtoId}`
        );
      }


      const sku =
        skuResult.rows[0];


      // ======================================================
      // SKU ATIVO
      // ======================================================

      if (
        !sku.ativo
      ) {

        throw new Error(
          `SKU indisponível: ${skuId}`
        );
      }


      // ======================================================
      // ESTOQUE DISPONÍVEL
      // ======================================================

      const estoque =
        Number(
          sku.estoque
        );


      const estoqueReservado =
        Number(
          sku.estoque_reservado
        );


      const estoqueDisponivel =
        estoque -
        estoqueReservado;


      if (
        estoqueDisponivel <
        quantidade
      ) {

        throw new Error(
          `Estoque insuficiente para o SKU ${skuId}`
        );
      }


      // ======================================================
      // PREÇO
      // ======================================================

      const preco =
        sku.sku_preco !== null
          ? Number(
              sku.sku_preco
            )
          : Number(
              sku.produto_preco
            );


      if (
        !Number.isFinite(
          preco
        ) ||
        preco < 0
      ) {

        throw new Error(
          `Preço inválido para o SKU ${skuId}`
        );
      }


      const subtotal =
        preco *
        quantidade;


      item.preco_unitario =
        preco;


      item.subtotal =
        subtotal;


      total +=
        subtotal;


      // ======================================================
      // RESERVA
      // ======================================================

      await client.query(
        `
          UPDATE produto_skus

          SET
            estoque_reservado =
              estoque_reservado + $1,

            updated_at =
              now()

          WHERE id = $2
        `,
        [
          quantidade,
          skuId
        ]
      );


      // ======================================================
      // RESERVA SERÁ VINCULADA AO PEDIDO
      // ======================================================

      item._sku_id =
        skuId;
    }


    // ========================================================
    // FRETE + DESCONTO
    // ========================================================

    const freteFinal =
      Number(frete) || 0;


    let desconto = 0;


    if (
      pagamento === "pix"
    ) {

      desconto =
        total * 0.05;
    }


    total =
      total +
      freteFinal -
      desconto;


    if (
      total <= 0
    ) {

      throw new Error(
        "Total inválido"
      );
    }


    // ========================================================
    // PEDIDO
    // ========================================================

    const pedido =
      await client.query(
        `
          INSERT INTO pedidos (
            pedido_codigo,
            cliente_id,

            rua,
            numero,
            complemento,
            bairro,
            cidade,
            estado,
            cep,

            entrega,
            pagamento,
            frete,
            prazo,

            status_pedido,
            status_pagamento,

            total,
            transportadora,
            whatsapp,
            nome_cliente,
            email_cliente,
            cpf_cliente
          )

          VALUES (
            $1,
            $2,

            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,

            $10,
            $11,
            $12,
            $13,

            'aguardando_pagamento',
            'pending',

            $14,
            $15,
            $16,
            $17,
            $18,
            $19
          )

          RETURNING
            id,
            pedido_codigo,
            nome_cliente
        `,
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


    const pedidoId =
      pedido.rows[0].id;


    const pedidoCodigo =
      pedido.rows[0].pedido_codigo;


    const nomeCliente =
      pedido.rows[0].nome_cliente;


    // ========================================================
    // ITENS + RESERVAS
    // ========================================================

    for (
      const item of itens
    ) {

      // ======================================================
      // PEDIDO_ITEM
      // ======================================================

      await client.query(
        `
          INSERT INTO pedido_itens (
            pedido_id,
            produto_id,
            produto_sku_id,
            quantidade,
            preco_unitario,
            subtotal,
            personalizacao_txt,
            personalizacao_img,
            variacao
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9
          )
        `,
        [
          pedidoId,

          item.produto_id,

          item._sku_id,

          item.quantidade,

          item.preco_unitario,

          item.subtotal,

          item.personalizacao_txt ||
            null,

          item.personalizacao_img ||
            null,

          item.variacao ||
            null
        ]
      );


      // ======================================================
      // RESERVA DO SKU
      // ======================================================

      await client.query(
        `
          INSERT INTO pedido_sku_reservas (
            pedido_id,
            produto_sku_id,
            quantidade,
            status,
            expires_at
          )

          VALUES (
            $1,
            $2,
            $3,
            'reservado',
            now() +
              interval '15 minutes'
          )
        `,
        [
          pedidoId,

          item._sku_id,

          item.quantidade
        ]
      );


      // ======================================================
      // MOVIMENTAÇÃO
      // ======================================================

      await client.query(
        `
          INSERT INTO movimentacoes_estoque (
            produto_sku_id,
            tipo,
            quantidade,
            estoque_anterior,
            estoque_posterior,
            motivo,
            pedido_id,
            observacao
          )

          SELECT
            id,
            'reserva',
            $1,
            estoque,
            estoque,
            'Reserva de estoque para pedido',
            $2,
            'Estoque reservado até pagamento ou expiração'

          FROM produto_skus

          WHERE id = $3
        `,
        [
          item.quantidade,

          pedidoId,

          item._sku_id
        ]
      );
    }


    // ========================================================
    // COMMIT
    // ========================================================

    await client.query(
      "COMMIT"
    );


    // ========================================================
    // RETORNO
    // ========================================================

    return send(
      res,
      200,
      {
        pedido_id:
          pedidoId,

        pedido_codigo:
          pedidoCodigo,

        nome_cliente:
          nomeCliente,

        total
      }
    );


  } catch (err) {

    await client.query(
      "ROLLBACK"
    );


    console.error(
      "Erro criar pedido:",
      err.message
    );


    return send(
      res,
      500,
      {
        error:
          "Erro ao criar pedido"
      }
    );


  } finally {

    client.release();
  }
}


// ============================================================
// HANDLER PRINCIPAL
// ============================================================

export default async function handler(
  req,
  res
) {

  // ==========================================================
  // OPTIONS / CORS
  // ==========================================================

  if (
    req.method === "OPTIONS"
  ) {

    return send(
      res,
      200,
      {}
    );
  }


  // ==========================================================
  // GET — BACKOFFICE
  // ==========================================================

  if (
    req.method === "GET"
  ) {

    if (
      !verificarSenhaBackoffice(
        req
      )
    ) {

      return send(
        res,
        401,
        {
          error:
            "Não autorizado"
        }
      );
    }


    // --------------------------------------------------------
    // GET pedido_itens
    // --------------------------------------------------------

    if (
      req.query?.tipo === "itens"
    ) {

      return listarPedidoItens(
        req,
        res
      );
    }


    // --------------------------------------------------------
    // GET pedidos
    // --------------------------------------------------------

    return listarPedidos(
      req,
      res
    );
  }


  // ==========================================================
  // PATCH — BACKOFFICE
  // ==========================================================

  if (
    req.method === "PATCH"
  ) {

    if (
      !verificarSenhaBackoffice(
        req
      )
    ) {

      return send(
        res,
        401,
        {
          error:
            "Não autorizado"
        }
      );
    }


    return editarPedido(
      req,
      res
    );
  }


  // ==========================================================
  // POST — SITE
  // ==========================================================

  if (
    req.method === "POST"
  ) {

    return criarPedido(
      req,
      res
    );
  }


  // ==========================================================
  // MÉTODO NÃO PERMITIDO
  // ==========================================================

  return send(
    res,
    405,
    {
      error:
        "Método não permitido"
    }
  );
}

/*import { pool } from "../lib/db.js";
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

  // RATE LIMIT
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
    console.log(
      "PAYLOAD FORMATADO:",
      JSON.stringify(payload, null, 2)
    );

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
    // VALIDAÇÕES BÁSICAS
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
    // TRANSACTION
    // ============================
    await client.query("BEGIN");

    // ============================
    // CLIENTE
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
    // PRODUTOS + SKU + TOTAL
    // ============================
    let total = 0;

    for (const item of itens) {

      // ============================
      // VALIDAÇÃO BÁSICA
      // ============================

      if (
        !item.produto_id ||
        !Number.isInteger(Number(item.produto_id)) ||
        !item.produto_sku_id ||
        !Number.isInteger(Number(item.produto_sku_id)) ||
        item.quantidade <= 0 ||
        item.quantidade > 50
      ) {
        throw new Error("Item inválido");
      }

      const produtoId = Number(item.produto_id);
      const skuId = Number(item.produto_sku_id);
      const quantidade = Number(item.quantidade);

        // ============================
        // BLOQUEIA O SKU
        // ============================

        const skuResult = await client.query(
          `
            SELECT
              ps.id,
              ps.produto_id,
              ps.estoque,
              ps.estoque_reservado,
              ps.preco AS sku_preco,
              ps.ativo,
              p.preco AS produto_preco
            FROM produto_skus ps
            INNER JOIN produtos p
              ON p.id = ps.produto_id
            WHERE ps.id = $1
              AND ps.produto_id = $2
            FOR UPDATE OF ps
          `,
          [skuId, produtoId]
        );

        if (skuResult.rows.length === 0) {
          throw new Error(
            `SKU inválido para o produto id: ${produtoId}`
          );
        }

        const sku = skuResult.rows[0];

      // ==========================================
      // 🔒 SKU ATIVO
      // ==========================================

      if (!sku.ativo) {
        throw new Error(
          `SKU indisponível: ${skuId}`
        );
      }

      // ============================
      // ESTOQUE DISPONÍVEL
      // ============================

      const estoque = Number(sku.estoque);
      const estoqueReservado = Number(sku.estoque_reservado);

      const estoqueDisponivel =
        estoque - estoqueReservado;

      if (estoqueDisponivel < quantidade) {
        throw new Error(
          `Estoque insuficiente para o SKU ${skuId}`
        );
      }

      // ==========================================
      // 💰 PREÇO
      // ==========================================

      const preco =
        sku.sku_preco !== null
          ? Number(sku.sku_preco)
          : Number(sku.produto_preco);

      if (!Number.isFinite(preco) || preco < 0) {
        throw new Error(
          `Preço inválido para o SKU ${skuId}`
        );
      }

      const subtotal =
        preco * quantidade;

      item.preco_unitario = preco;
      item.subtotal = subtotal;

      total += subtotal;

      // ============================
      // RESERVA
      // ============================

      await client.query(
        `
          UPDATE produto_skus
          SET
            estoque_reservado =
              estoque_reservado + $1,
            updated_at = now()
          WHERE id = $2
        `,
        [quantidade, skuId]
      );

      // ============================
      // A RESERVA SERÁ VINCULADA
      // AO PEDIDO LOGO ABAIXO
      // ============================

      item._sku_id = skuId;

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
    // ITENS + RESERVAS
    // ============================

    for (const item of itens) {

      // ============================
      // PEDIDO_ITEM
      // ============================

      await client.query(
        `
          INSERT INTO pedido_itens (
            pedido_id,
            produto_id,
            produto_sku_id,
            quantidade,
            preco_unitario,
            subtotal,
            personalizacao_txt,
            personalizacao_img,
            variacao
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
          )
        `,
        [
          pedidoId,
          item.produto_id,
          item._sku_id,
          item.quantidade,
          item.preco_unitario,
          item.subtotal,
          item.personalizacao_txt || null,
          item.personalizacao_img || null,
          item.variacao || null
        ]
      );

      // ============================
      // RESERVA DO SKU
      // ============================

      await client.query(
        `
          INSERT INTO pedido_sku_reservas (
            pedido_id,
            produto_sku_id,
            quantidade,
            status,
            expires_at
          )
          VALUES (
            $1,
            $2,
            $3,
            'reservado',
            now() + interval '15 minutes'
          )
        `,
        [
          pedidoId,
          item._sku_id,
          item.quantidade
        ]
      );

      // ============================
      // MOVIMENTAÇÃO
      // ============================

      await client.query(
        `
          INSERT INTO movimentacoes_estoque (
            produto_sku_id,
            tipo,
            quantidade,
            estoque_anterior,
            estoque_posterior,
            motivo,
            pedido_id,
            observacao
          )
          SELECT
            id,
            'reserva',
            $1,
            estoque,
            estoque,
            'Reserva de estoque para pedido',
            $2,
            'Estoque reservado até pagamento ou expiração'
          FROM produto_skus
          WHERE id = $3
        `,
        [
          item.quantidade,
          pedidoId,
          item._sku_id
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
}*/
