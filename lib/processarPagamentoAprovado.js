import { enviarTelegram } from "./telegram.js";
import { pool } from "./db.js";

export async function processarPagamentoAprovado({
    pedido_id,
    payment
}) {

    const client = await pool.connect();

    let pedido;
    let itens;
    let deveEnviarTelegram = false;

    try {

        await client.query("BEGIN");

        // =========================================================
        // 1. BLOQUEIA O PEDIDO
        // =========================================================

        const pedidoResult = await client.query(
            `
            SELECT *
            FROM pedidos
            WHERE id = $1
            FOR UPDATE
            `,
            [pedido_id]
        );

        if (pedidoResult.rows.length === 0) {
            throw new Error(
                `Pedido não encontrado: ${pedido_id}`
            );
        }

        pedido = pedidoResult.rows[0];


        // =========================================================
        // 2. IDEMPOTÊNCIA
        // =========================================================
        // Se o webhook já processou esse pagamento anteriormente,
        // não devemos baixar o estoque novamente.

        if (pedido.status_pagamento === "approved") {

            await client.query("ROLLBACK");

            console.log(
                `Pagamento do pedido ${pedido_id} já processado.`
            );

            return;
        }


        // =========================================================
        // 3. BUSCA RESERVAS DO PEDIDO
        // =========================================================

        const reservasResult = await client.query(
            `
            SELECT
                id,
                pedido_id,
                produto_sku_id,
                quantidade,
                status,
                expires_at
            FROM pedido_sku_reservas
            WHERE pedido_id = $1
            ORDER BY id
            FOR UPDATE
            `,
            [pedido_id]
        );

        const reservas = reservasResult.rows;

        if (reservas.length === 0) {
            throw new Error(
                `Nenhuma reserva encontrada para o pedido ${pedido_id}`
            );
        }


        // =========================================================
        // 4. CONSUME AS RESERVAS
        // =========================================================

        for (const reserva of reservas) {

            // -----------------------------------------------------
            // Reserva precisa estar disponível para consumo
            // -----------------------------------------------------

            if (reserva.status !== "reservado") {

                throw new Error(
                    `Reserva ${reserva.id} não está disponível para consumo. ` +
                    `Status atual: ${reserva.status}`
                );
            }


            // -----------------------------------------------------
            // BLOQUEIA O SKU
            // -----------------------------------------------------

            const skuResult = await client.query(
                `
                SELECT
                    id,
                    produto_id,
                    estoque,
                    estoque_reservado,
                    ativo
                FROM produto_skus
                WHERE id = $1
                FOR UPDATE
                `,
                [reserva.produto_sku_id]
            );

            if (skuResult.rows.length === 0) {

                throw new Error(
                    `SKU não encontrado: ${reserva.produto_sku_id}`
                );
            }

            const sku = skuResult.rows[0];


            // -----------------------------------------------------
            // PROTEÇÃO DE ESTOQUE RESERVADO
            // -----------------------------------------------------

            if (
                Number(sku.estoque_reservado) <
                Number(reserva.quantidade)
            ) {

                throw new Error(
                    `Estoque reservado insuficiente para o SKU ` +
                    `${reserva.produto_sku_id}`
                );
            }


            // -----------------------------------------------------
            // PROTEÇÃO DE ESTOQUE FÍSICO
            // -----------------------------------------------------

            if (
                Number(sku.estoque) <
                Number(reserva.quantidade)
            ) {

                throw new Error(
                    `Estoque físico insuficiente para o SKU ` +
                    `${reserva.produto_sku_id}`
                );
            }


            const estoqueAnterior =
                Number(sku.estoque);

            const estoqueReservadoAnterior =
                Number(sku.estoque_reservado);

            const quantidade =
                Number(reserva.quantidade);

            const estoquePosterior =
                estoqueAnterior - quantidade;

            const estoqueReservadoPosterior =
                estoqueReservadoAnterior - quantidade;


            // -----------------------------------------------------
            // BAIXA FÍSICA + LIBERA RESERVA
            // -----------------------------------------------------

            await client.query(
                `
                UPDATE produto_skus
                SET
                    estoque = $1,
                    estoque_reservado = $2,
                    updated_at = now()
                WHERE id = $3
                `,
                [
                    estoquePosterior,
                    estoqueReservadoPosterior,
                    sku.id
                ]
            );


            // -----------------------------------------------------
            // RESERVA → CONSUMIDO
            // -----------------------------------------------------

            await client.query(
                `
                UPDATE pedido_sku_reservas
                SET
                    status = 'consumido',
                    updated_at = now()
                WHERE id = $1
                `,
                [reserva.id]
            );


            // -----------------------------------------------------
            // AUDITORIA
            // -----------------------------------------------------

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
                VALUES (
                    $1,
                    'baixa',
                    $2,
                    $3,
                    $4,
                    'Baixa definitiva após pagamento aprovado',
                    $5,
                    'Reserva consumida após confirmação do pagamento'
                )
                `,
                [
                    sku.id,
                    quantidade,
                    estoqueAnterior,
                    estoquePosterior,
                    pedido_id
                ]
            );
        }


        // =========================================================
        // 5. ATUALIZA PEDIDO
        // =========================================================

        const pedidoAtualizado = await client.query(
            `
            UPDATE pedidos
            SET
                status_pagamento = 'approved',
                status_pedido = 'producao',
                mp_payment_id = $1,
                external_reference = $2,
                mp_status = $3,
                mp_status_detail = $4,
                mp_payment_type = $5,
                mp_payment_method = $6,
                mp_date_approved = $7,
                paid_at = now()
            WHERE id = $8
            RETURNING *
            `,
            [
                String(payment.id),
                payment.external_reference,
                payment.status,
                payment.status_detail,
                payment.payment_type_id,
                payment.payment_method_id,
                payment.date_approved || new Date().toISOString(),
                pedido_id
            ]
        );

        pedido = pedidoAtualizado.rows[0];


        // =========================================================
        // 6. BUSCA ITENS DO PEDIDO
        // =========================================================

        const itensResult = await client.query(
            `
            SELECT *
            FROM pedido_itens
            WHERE pedido_id = $1
            ORDER BY id
            `,
            [pedido_id]
        );

        itens = itensResult.rows;


        // =========================================================
        // 7. COMMIT
        // =========================================================

        await client.query("COMMIT");

        deveEnviarTelegram = true;

        console.log(
            `Pagamento aprovado e estoque baixado para o pedido ${pedido_id}.`
        );


    } catch (err) {

        await client.query("ROLLBACK");

        console.error(
            "Erro processarPagamentoAprovado:",
            err.message
        );

        throw err;

    } finally {

        client.release();
    }


    // =============================================================
    // 8. TELEGRAM
    // =============================================================
    // Só enviamos depois do COMMIT.
    // Assim, o Telegram nunca fica dentro da transação do banco.

    if (deveEnviarTelegram) {

        try {

            const ids = itens
                .map(i => i.produto_id)
                .filter(Boolean);

            let produtos = [];

            if (ids.length > 0) {

                const produtosResult = await pool.query(
                    `
                    SELECT id, nome
                    FROM produtos
                    WHERE id = ANY($1::int[])
                    `,
                    [ids]
                );

                produtos = produtosResult.rows;
            }


            // -----------------------------------------------------
            // MAPA DE PRODUTOS
            // -----------------------------------------------------

            const produtosMap = {};

            for (const p of produtos) {
                produtosMap[p.id] = p;
            }


            // -----------------------------------------------------
            // FORMATA ITENS
            // -----------------------------------------------------

            const itensFormatados = itens.map(item => ({
                ...item,

                nome:
                    produtosMap[item.produto_id]?.nome ||
                    "Produto",

                variacao:
                    item.variacao &&
                    item.variacao !== "sem_cor"
                        ? item.variacao
                        : null
            }));


            await enviarTelegram({
                mensagem: montarMensagemPedido(
                    pedido,
                    itensFormatados
                ),
                botoes: [
                    [
                        {
                            text: "✅ Marcar como produzido",
                            callback_data:
                                `produzido:${pedido.id}`
                        }
                    ]
                ]
            });

        } catch (telegramError) {

            console.error(
                "Erro ao enviar Telegram:",
                telegramError.message
            );

            // Não fazemos rollback.
            // O pedido e o estoque já foram confirmados.
        }
    }
}

function montarMensagemPedido(pedido, itensFormatados) {
    
  const itensTexto = itensFormatados
    .map(i => {

        const variacao = i.variacao
        ? ` (${i.variacao})`
        : "";

        return `• ${i.quantidade}x ${i.nome}${variacao} - R$ ${Number(i.subtotal).toFixed(2)}`;

    })
    .join("\n");

  return `
🔥 <b>NOVO PEDIDO APROVADO</b>

🧾 <b>${pedido.pedido_codigo}</b>
💰 R$ ${Number(pedido.total).toFixed(2)}

👤 ${pedido.nome_cliente}
📱 ${pedido.whatsapp}

📦 <b>Itens:</b>
${itensTexto}

📍 <b>Endereço:</b>
${pedido.rua}, ${pedido.numero}
${pedido.bairro} - ${pedido.cidade}/${pedido.estado}

🚚 ${pedido.transportadora || "Retirada"}

🚀 <b>Status: EM PRODUÇÃO</b>
`;
}

