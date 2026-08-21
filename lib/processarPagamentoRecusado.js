import { pool } from "../lib/db.js";

export async function processarPagamentoRecusado({
    pedido_id,
    payment
}) {

    const client = await pool.connect();

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

        const pedido = pedidoResult.rows[0];


        // =========================================================
        // 2. BUSCA E BLOQUEIA AS RESERVAS
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


        // =========================================================
        // 3. LIBERA CADA RESERVA
        // =========================================================

        for (const reserva of reservas) {

            // -----------------------------------------------------
            // Só uma reserva ativa pode ser liberada
            // -----------------------------------------------------

            if (reserva.status !== "reservado") {
                continue;
            }


            // -----------------------------------------------------
            // BLOQUEIA O SKU
            // -----------------------------------------------------

            const skuResult = await client.query(
                `
                SELECT
                    id,
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
            // PROTEÇÃO
            // -----------------------------------------------------

            const estoque =
                Number(sku.estoque);

            const estoqueReservado =
                Number(sku.estoque_reservado);

            const quantidade =
                Number(reserva.quantidade);

            if (estoqueReservado < quantidade) {
                throw new Error(
                    `Estoque reservado insuficiente para liberar ` +
                    `o SKU ${reserva.produto_sku_id}`
                );
            }


            // -----------------------------------------------------
            // LIBERA RESERVA
            // -----------------------------------------------------

            const estoqueReservadoPosterior =
                estoqueReservado - quantidade;

            await client.query(
                `
                UPDATE produto_skus
                SET
                    estoque_reservado = $1,
                    updated_at = now()
                WHERE id = $2
                `,
                [
                    estoqueReservadoPosterior,
                    sku.id
                ]
            );


            // -----------------------------------------------------
            // RESERVA → LIBERADO
            // -----------------------------------------------------

            await client.query(
                `
                UPDATE pedido_sku_reservas
                SET
                    status = 'liberado',
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
                    'liberacao_reserva',
                    $2,
                    $3,
                    $4,
                    'Liberação de reserva após pagamento recusado ou cancelado',
                    $5,
                    'Reserva liberada sem alteração do estoque físico'
                )
                `,
                [
                    sku.id,
                    quantidade,
                    estoque,
                    estoque,
                    pedido_id
                ]
            );
        }


        // =========================================================
        // 4. ATUALIZA PEDIDO
        // =========================================================

        await client.query(
            `
            UPDATE pedidos
            SET
                status_pagamento = $1,
                status_pedido = 'aguardando_pagamento',
                mp_payment_id = $2,
                external_reference = $3,
                mp_status = $4,
                mp_status_detail = $5,
                mp_payment_type = $6,
                mp_payment_method = $7
            WHERE id = $8
            `,
            [
                payment.status,
                String(payment.id),
                payment.external_reference,
                payment.status,
                payment.status_detail,
                payment.payment_type_id,
                payment.payment_method_id,
                pedido_id
            ]
        );


        // =========================================================
        // 5. COMMIT
        // =========================================================

        await client.query("COMMIT");

        console.log(
            `Pagamento ${payment.status} processado e reserva liberada para o pedido ${pedido_id}.`
        );

    } catch (error) {

        await client.query("ROLLBACK");

        console.error(
            "Erro processarPagamentoRecusado:",
            error.message
        );

        throw error;

    } finally {

        client.release();
    }
}
