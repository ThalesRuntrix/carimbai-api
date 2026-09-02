import { pool } from "../lib/db.js";

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
    "GET,PATCH,POST,DELETE,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  return res.status(status).json(data);
}

/* ============================================================
   UTILITÁRIOS
============================================================ */

function validarUUID(token) {

    if (!token || typeof token !== "string") {
        return false;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        token
    );
}


function normalizarQuantidade(valor) {

    const quantidade = Number(valor);

    if (!Number.isInteger(quantidade)) {
        return null;
    }

    if (quantidade <= 0 || quantidade > 50) {
        return null;
    }

    return quantidade;
}


function normalizarObjetoConfiguracao(configuracao) {

    if (
        configuracao === null ||
        configuracao === undefined
    ) {
        return {};
    }

    if (
        typeof configuracao !== "object" ||
        Array.isArray(configuracao)
    ) {
        throw new Error(
            "Configuração inválida"
        );
    }

    return configuracao;
}


/* ============================================================
   CRIAR CARRINHO
============================================================ */

async function criarCarrinho(client) {

    const result = await client.query(
        `
        INSERT INTO carrinhos (
            status
        )

        VALUES (
            'ativo'
        )

        RETURNING
            id,
            token,
            status,
            created_at,
            updated_at
        `
    );

    return result.rows[0];
}


/* ============================================================
   BUSCAR CARRINHO
============================================================ */

async function buscarCarrinho(
    client,
    token,
    bloquear = false
) {

    const lock = bloquear
        ? "FOR UPDATE"
        : "";

    const result = await client.query(
        `
        SELECT
            id,
            token,
            status,
            created_at,
            updated_at

        FROM carrinhos

        WHERE token = $1

        ${lock}
        `,
        [token]
    );

    return result.rows[0] || null;
}


/* ============================================================
   BUSCAR ITENS DO CARRINHO
============================================================ */

async function buscarItensCarrinho(
    client,
    carrinhoId
) {

    const result = await client.query(
        `
        SELECT
            ci.id,
            ci.carrinho_id,
            ci.produto_id,
            ci.produto_sku_id,
            ci.quantidade,
            ci.produto_nome,
            ci.sku,
            ci.variacao,
            ci.preco_unitario,
            ci.personalizacao_txt,
            ci.personalizacao_img,
            ci.imagem_url,
            ci.configuracao,
            ci.created_at,
            ci.updated_at,

            (
                ci.preco_unitario *
                ci.quantidade
            ) AS subtotal

        FROM carrinho_itens ci

        WHERE ci.carrinho_id = $1

        ORDER BY ci.id
        `,
        [carrinhoId]
    );

    return result.rows;
}


/* ============================================================
   MONTAR RESPOSTA DO CARRINHO
============================================================ */

function montarCarrinho(carrinho, itens) {

    let total = 0;
    let quantidadeItens = 0;

    const itensFormatados = itens.map(item => {

        const precoUnitario =
            Number(item.preco_unitario);

        const quantidade =
            Number(item.quantidade);

        const subtotal =
            precoUnitario * quantidade;

        total += subtotal;
        quantidadeItens += quantidade;

        return {
            id: item.id,

            produto_id:
                Number(item.produto_id),

            produto_sku_id:
                Number(item.produto_sku_id),

            produto_nome:
                item.produto_nome,

            sku:
                item.sku,

            variacao:
                item.variacao,

            imagem_url:
                item.imagem_url, 

            quantidade,

            preco_unitario:
                precoUnitario,

            subtotal,

            personalizacao_txt:
                item.personalizacao_txt,

            personalizacao_img:
                item.personalizacao_img,               

            configuracao:
                item.configuracao || {}
        };
    });

    return {
        token: carrinho.token,

        status: carrinho.status,

        itens: itensFormatados,

        quantidade_itens: quantidadeItens,

        quantidade_linhas:
            itensFormatados.length,

        subtotal:
            Number(total.toFixed(2))
    };
}


/* ============================================================
   GET
   CONSULTAR CARRINHO
============================================================ */

async function obterCarrinho(req, res) {

    const token =
        String(req.query?.token || "").trim();


    // ---------------------------------------------------------
    // Sem token:
    // devolve carrinho vazio.
    // Isso facilita muito o frontend.
    // ---------------------------------------------------------

    if (!token) {

        return send(
            res,
            200,
            {
                token: null,
                status: "vazio",
                itens: [],
                quantidade_itens: 0,
                quantidade_linhas: 0,
                subtotal: 0
            }
        );
    }


    if (!validarUUID(token)) {

        return send(
            res,
            400,
            {
                error:
                    "Token do carrinho inválido"
            }
        );
    }


    const client =
        await pool.connect();


    try {

        const carrinho =
            await buscarCarrinho(
                client,
                token
            );


        // -----------------------------------------------------
        // Carrinho não existe
        // -----------------------------------------------------

        if (!carrinho) {

            return send(
                res,
                200,
                {
                    token,
                    status: "vazio",
                    itens: [],
                    quantidade_itens: 0,
                    quantidade_linhas: 0,
                    subtotal: 0
                }
            );
        }


        // -----------------------------------------------------
        // Carrinho não está ativo
        // -----------------------------------------------------

        if (carrinho.status !== "ativo") {

            return send(
                res,
                200,
                {
                    token:
                        carrinho.token,

                    status:
                        carrinho.status,

                    itens: [],

                    quantidade_itens: 0,

                    quantidade_linhas: 0,

                    subtotal: 0
                }
            );
        }


        const itens =
            await buscarItensCarrinho(
                client,
                carrinho.id
            );


        return send(
            res,
            200,
            montarCarrinho(
                carrinho,
                itens
            )
        );

    }

    catch (error) {

        console.error(
            "Erro obterCarrinho:",
            error.message
        );

        return send(
            res,
            500,
            {
                error:
                    "Erro ao carregar carrinho"
            }
        );

    }

    finally {

        client.release();
    }
}


/* ============================================================
   POST
   ADICIONAR ITEM AO CARRINHO
============================================================ */

async function adicionarItem(
    req,
    res
) {

    const body =
        req.body || {};


    const produtoId =
        Number(body.produto_id);

    const skuId =
        Number(body.produto_sku_id);


    if (
        !Number.isInteger(produtoId) ||
        produtoId <= 0
    ) {

        return send(
            res,
            400,
            {
                error:
                    "Produto inválido"
            }
        );
    }


    if (
        !Number.isInteger(skuId) ||
        skuId <= 0
    ) {

        return send(
            res,
            400,
            {
                error:
                    "SKU inválido"
            }
        );
    }


    const quantidade =
        normalizarQuantidade(
            body.quantidade
        );


    if (!quantidade) {

        return send(
            res,
            400,
            {
                error:
                    "Quantidade inválida"
            }
        );
    }


    const variacao =
        body.variacao
            ? String(body.variacao).trim().slice(0, 200)
            : null;


    const personalizacaoTxt =
        body.personalizacao_txt
            ? String(
                body.personalizacao_txt
              ).slice(0, 500)
            : null;


    const personalizacaoImg =
        body.personalizacao_img
            ? String(
                body.personalizacao_img
              ).slice(0, 2000)
            : null;


    let configuracao;

    try {

        configuracao =
            normalizarObjetoConfiguracao(
                body.configuracao
            );

    } catch (error) {

        return send(
            res,
            400,
            {
                error:
                    error.message
            }
        );
    }


    // ========================================================
    // TOKEN
    // ========================================================

    let token =
        body.token
            ? String(body.token).trim()
            : null;


    if (token && !validarUUID(token)) {

        return send(
            res,
            400,
            {
                error:
                    "Token do carrinho inválido"
            }
        );
    }


    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        // ====================================================
        // CARRINHO
        // ====================================================

        let carrinho;


        if (token) {

            carrinho =
                await buscarCarrinho(
                    client,
                    token,
                    true
                );


            // ------------------------------------------------
            // Token não existe
            // ------------------------------------------------

            if (!carrinho) {

                carrinho =
                    await criarCarrinho(
                        client
                    );

                token =
                    carrinho.token;
            }

        } else {

            carrinho =
                await criarCarrinho(
                    client
                );

            token =
                carrinho.token;
        }


        if (
            carrinho.status !== "ativo"
        ) {

            throw new Error(
                "Carrinho não está ativo"
            );
        }


        // ====================================================
        // PRODUTO + SKU
        // ====================================================
        // O frontend NÃO informa preço.
        // O backend busca o preço real.
        // ====================================================

        const skuResult =
            await client.query(
                `
                SELECT
                    ps.id,
                    ps.produto_id,
                    ps.produto_variacao_id,
                    ps.sku,
                    ps.nome AS sku_nome,
                    ps.cor,
                    ps.preco AS sku_preco,
                    ps.estoque,
                    ps.estoque_reservado,
                    ps.ativo,

                    p.nome AS produto_nome,
                    p.preco AS produto_preco,

                    COALESCE(
                        pv.imagem_url,

                        (
                            SELECT pi.imagem_url
                            FROM produto_imagens pi
                            WHERE
                                pi.produto_id = p.id
                                AND (
                                    pi.cor IS NULL
                                    OR pi.cor = ps.cor
                                )
                            ORDER BY
                                pi.ordem ASC,
                                pi.id ASC
                            LIMIT 1
                        )
                    ) AS imagem_url

                FROM produto_skus ps

                INNER JOIN produtos p
                    ON p.id = ps.produto_id

                LEFT JOIN produto_variacoes pv
                    ON pv.id = ps.produto_variacao_id

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
                "SKU inválido para o produto"
            );
        }


        const sku =
            skuResult.rows[0];


        // ====================================================
        // SKU ATIVO
        // ====================================================

        if (!sku.ativo) {

            throw new Error(
                "SKU indisponível"
            );
        }


        // ====================================================
        // ESTOQUE DISPONÍVEL
        // ====================================================

        const estoque =
            Number(sku.estoque);

        const estoqueReservado =
            Number(
                sku.estoque_reservado
            );

        const estoqueDisponivel =
            estoque -
            estoqueReservado;


        if (
            estoqueDisponivel <= 0
        ) {

            throw new Error(
                "Produto sem estoque disponível"
            );
        }


        // ====================================================
        // PREÇO
        // ====================================================

        const preco =
            sku.sku_preco !== null
                ? Number(sku.sku_preco)
                : Number(sku.produto_preco);


        if (
            !Number.isFinite(preco) ||
            preco < 0
        ) {

            throw new Error(
                "Preço inválido para o SKU"
            );
        }


        // ====================================================
        // ITEM EXISTENTE
        // ====================================================
        //
        // Duas linhas são consideradas o mesmo item quando:
        //
        // produto
        // SKU
        // personalizacao_txt
        // personalizacao_img
        // variacao
        // configuracao
        //
        // Isso permite:
        //
        // SKU X + texto A
        // SKU X + texto B
        //
        // como duas linhas diferentes.
        // ====================================================

        const itemResult =
            await client.query(
                `
                SELECT
                    id,
                    quantidade

                FROM carrinho_itens

                WHERE
                    carrinho_id = $1
                    AND produto_id = $2
                    AND produto_sku_id = $3

                    AND (
                        personalizacao_txt IS NOT DISTINCT FROM $4
                    )

                    AND (
                        personalizacao_img IS NOT DISTINCT FROM $5
                    )

                    AND (
                        variacao IS NOT DISTINCT FROM $6
                    )

                    AND configuracao = $7::jsonb

                FOR UPDATE
                `,
                [
                    carrinho.id,
                    produtoId,
                    skuId,
                    personalizacaoTxt,
                    personalizacaoImg,
                    variacao,
                    JSON.stringify(configuracao)
                ]
            );


        const itemExistente =
            itemResult.rows[0] ||
            null;


        const quantidadeAtual =
            itemExistente
                ? Number(itemExistente.quantidade)
                : 0;


        const novaQuantidade =
            quantidadeAtual +
            quantidade;


        // ====================================================
        // LIMITE POR ITEM
        // ====================================================

        if (
            novaQuantidade > 50
        ) {

            throw new Error(
                "Quantidade máxima por item: 50"
            );
        }


        // ====================================================
        // ESTOQUE
        // ====================================================

        if (
            novaQuantidade >
            estoqueDisponivel
        ) {

            throw new Error(
                `Quantidade indisponível. Estoque disponível: ${estoqueDisponivel}`
            );
        }


        // ====================================================
        // ATUALIZAR ITEM EXISTENTE
        // ====================================================

        if (itemExistente) {

            await client.query(
                `
                UPDATE carrinho_itens

                SET
                    quantidade = $1,
                    preco_unitario = $2,
                    produto_nome = $3,
                    sku = $4,
                    imagem_url = $5,
                    updated_at = now()

                WHERE id = $6
                `,
                [
                    novaQuantidade,
                    preco,
                    sku.produto_nome,
                    sku.sku,
                    sku.imagem_url,
                    itemExistente.id
                ]
            );

        }

        // ====================================================
        // CRIAR NOVO ITEM
        // ====================================================

        else {

            await client.query(
                `
                INSERT INTO carrinho_itens (

                    carrinho_id,
                    produto_id,
                    produto_sku_id,
                    quantidade,
                    produto_nome,
                    sku,
                    variacao,
                    preco_unitario,
                    personalizacao_txt,
                    personalizacao_img,
                    imagem_url,
                    configuracao
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
                    $12
                )
                `,
                [
                    carrinho.id,

                    produtoId,

                    skuId,

                    quantidade,

                    sku.produto_nome,

                    sku.sku,

                    variacao,

                    preco,

                    personalizacaoTxt,

                    personalizacaoImg,

                    sku.imagem_url,

                    JSON.stringify(configuracao)
                ]
            );
        }


        // ====================================================
        // ATUALIZAR CARRINHO
        // ====================================================

        await client.query(
            `
            UPDATE carrinhos

            SET
                updated_at = now()

            WHERE id = $1
            `,
            [
                carrinho.id
            ]
        );


        // ====================================================
        // RECARREGAR CARRINHO
        // ====================================================

        const itens =
            await buscarItensCarrinho(
                client,
                carrinho.id
            );


        const resultado =
            montarCarrinho(
                carrinho,
                itens
            );


        await client.query(
            "COMMIT"
        );


        return send(
            res,
            200,
            resultado
        );

    }

    catch (error) {

        await client.query(
            "ROLLBACK"
        );


        console.error(
            "Erro adicionarItemCarrinho:",
            error.message
        );


        const mensagem =
            error.message || "";


        if (
            mensagem.includes(
                "Quantidade indisponível"
            ) ||
            mensagem.includes(
                "sem estoque"
            )
        ) {

            return send(
                res,
                409,
                {
                    error:
                        mensagem
                }
            );
        }


        if (
            mensagem.includes(
                "SKU indisponível"
            )
        ) {

            return send(
                res,
                409,
                {
                    error:
                        mensagem
                }
            );
        }


        return send(
            res,
            400,
            {
                error:
                    mensagem ||
                    "Erro ao adicionar item ao carrinho"
            }
        );

    }

    finally {

        client.release();
    }
}


/* ============================================================
   PATCH
   ALTERAR QUANTIDADE
============================================================ */

async function alterarQuantidade(
    req,
    res
) {

    const token =
        String(
            req.body?.token || ""
        ).trim();


    if (!validarUUID(token)) {

        return send(
            res,
            400,
            {
                error:
                    "Token do carrinho inválido"
            }
        );
    }


    const itemId =
        Number(
            req.body?.item_id
        );


    if (
        !Number.isInteger(itemId) ||
        itemId <= 0
    ) {

        return send(
            res,
            400,
            {
                error:
                    "Item inválido"
            }
        );
    }


    const quantidade =
        normalizarQuantidade(
            req.body?.quantidade
        );


    if (!quantidade) {

        return send(
            res,
            400,
            {
                error:
                    "Quantidade inválida"
            }
        );
    }


    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        const carrinho =
            await buscarCarrinho(
                client,
                token,
                true
            );


        if (!carrinho) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                404,
                {
                    error:
                        "Carrinho não encontrado"
                }
            );
        }


        if (
            carrinho.status !== "ativo"
        ) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                409,
                {
                    error:
                        "Carrinho não está ativo"
                }
            );
        }


        // ====================================================
        // ITEM + SKU
        // ====================================================

        const itemResult =
            await client.query(
                `
                SELECT
                    ci.id,
                    ci.produto_id,
                    ci.produto_sku_id,

                    ps.estoque,
                    ps.estoque_reservado,
                    ps.ativo

                FROM carrinho_itens ci

                INNER JOIN produto_skus ps
                    ON ps.id = ci.produto_sku_id

                WHERE
                    ci.id = $1
                    AND ci.carrinho_id = $2

                FOR UPDATE OF ci, ps
                `,
                [
                    itemId,
                    carrinho.id
                ]
            );


        if (
            itemResult.rows.length === 0
        ) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                404,
                {
                    error:
                        "Item não encontrado"
                }
            );
        }


        const item =
            itemResult.rows[0];


        if (!item.ativo) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                409,
                {
                    error:
                        "SKU indisponível"
                }
            );
        }


        const estoqueDisponivel =
            Number(item.estoque) -
            Number(item.estoque_reservado);


        if (
            quantidade >
            estoqueDisponivel
        ) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                409,
                {
                    error:
                        `Quantidade indisponível. Estoque disponível: ${estoqueDisponivel}`
                }
            );
        }


        // ====================================================
        // UPDATE
        // ====================================================

        await client.query(
            `
            UPDATE carrinho_itens

            SET
                quantidade = $1,
                updated_at = now()

            WHERE id = $2
            `,
            [
                quantidade,
                itemId
            ]
        );


        await client.query(
            `
            UPDATE carrinhos

            SET
                updated_at = now()

            WHERE id = $1
            `,
            [
                carrinho.id
            ]
        );


        const itens =
            await buscarItensCarrinho(
                client,
                carrinho.id
            );


        const resultado =
            montarCarrinho(
                carrinho,
                itens
            );


        await client.query(
            "COMMIT"
        );


        return send(
            res,
            200,
            resultado
        );

    }

    catch (error) {

        await client.query(
            "ROLLBACK"
        );


        console.error(
            "Erro alterarQuantidadeCarrinho:",
            error.message
        );


        return send(
            res,
            400,
            {
                error:
                    error.message ||
                    "Erro ao alterar quantidade"
            }
        );

    }

    finally {

        client.release();
    }
}


/* ============================================================
   DELETE
   REMOVER ITEM
============================================================ */

async function removerItem(
    req,
    res
) {

    const token =
        String(
            req.query?.token ||
            req.body?.token ||
            ""
        ).trim();


    if (!validarUUID(token)) {

        return send(
            res,
            400,
            {
                error:
                    "Token do carrinho inválido"
            }
        );
    }


    const itemId =
        Number(
            req.query?.item_id ||
            req.body?.item_id
        );


    if (
        !Number.isInteger(itemId) ||
        itemId <= 0
    ) {

        return send(
            res,
            400,
            {
                error:
                    "Item inválido"
            }
        );
    }


    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        const carrinho =
            await buscarCarrinho(
                client,
                token,
                true
            );


        if (!carrinho) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                404,
                {
                    error:
                        "Carrinho não encontrado"
                }
            );
        }


        if (
            carrinho.status !== "ativo"
        ) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                409,
                {
                    error:
                        "Carrinho não está ativo"
                }
            );
        }


        const result =
            await client.query(
                `
                DELETE FROM carrinho_itens

                WHERE
                    id = $1
                    AND carrinho_id = $2

                RETURNING id
                `,
                [
                    itemId,
                    carrinho.id
                ]
            );


        if (
            result.rows.length === 0
        ) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                404,
                {
                    error:
                        "Item não encontrado"
                }
            );
        }


        await client.query(
            `
            UPDATE carrinhos

            SET
                updated_at = now()

            WHERE id = $1
            `,
            [
                carrinho.id
            ]
        );


        const itens =
            await buscarItensCarrinho(
                client,
                carrinho.id
            );


        const resultado =
            montarCarrinho(
                carrinho,
                itens
            );


        await client.query(
            "COMMIT"
        );


        return send(
            res,
            200,
            resultado
        );

    }

    catch (error) {

        await client.query(
            "ROLLBACK"
        );


        console.error(
            "Erro removerItemCarrinho:",
            error.message
        );


        return send(
            res,
            500,
            {
                error:
                    "Erro ao remover item do carrinho"
            }
        );

    }

    finally {

        client.release();
    }
}


/* ============================================================
   DELETE
   LIMPAR CARRINHO
============================================================ */

async function limparCarrinho(
    req,
    res
) {

    const token =
        String(
            req.query?.token ||
            req.body?.token ||
            ""
        ).trim();


    if (!validarUUID(token)) {

        return send(
            res,
            400,
            {
                error:
                    "Token do carrinho inválido"
            }
        );
    }


    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        const carrinho =
            await buscarCarrinho(
                client,
                token,
                true
            );


        if (!carrinho) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                404,
                {
                    error:
                        "Carrinho não encontrado"
                }
            );
        }


        if (
            carrinho.status !== "ativo"
        ) {

            await client.query(
                "ROLLBACK"
            );

            return send(
                res,
                409,
                {
                    error:
                        "Carrinho não está ativo"
                }
            );
        }


        await client.query(
            `
            DELETE FROM carrinho_itens

            WHERE carrinho_id = $1
            `,
            [
                carrinho.id
            ]
        );


        await client.query(
            `
            UPDATE carrinhos

            SET
                updated_at = now()

            WHERE id = $1
            `,
            [
                carrinho.id
            ]
        );


        await client.query(
            "COMMIT"
        );


        return send(
            res,
            200,
            {
                token:
                    carrinho.token,

                status:
                    carrinho.status,

                itens: [],

                quantidade_itens:
                    0,

                quantidade_linhas:
                    0,

                subtotal:
                    0
            }
        );

    }

    catch (error) {

        await client.query(
            "ROLLBACK"
        );


        console.error(
            "Erro limparCarrinho:",
            error.message
        );


        return send(
            res,
            500,
            {
                error:
                    "Erro ao limpar carrinho"
            }
        );

    }

    finally {

        client.release();
    }
}


/* ============================================================
   HANDLER
============================================================ */

export default async function handler(
    req,
    res
) {

    // ========================================================
    // OPTIONS / CORS
    // ========================================================

    if (
        req.method === "OPTIONS"
    ) {

        return send(
            res,
            200,
            {}
        );
    }


    // ========================================================
    // GET
    // ========================================================

    if (
        req.method === "GET"
    ) {

        return obterCarrinho(
            req,
            res
        );
    }


    // ========================================================
    // POST
    // ========================================================

    if (
        req.method === "POST"
    ) {

        return adicionarItem(
            req,
            res
        );
    }


    // ========================================================
    // PATCH
    // ========================================================

    if (
        req.method === "PATCH"
    ) {

        return alterarQuantidade(
            req,
            res
        );
    }


    // ========================================================
    // DELETE
    // ========================================================

    if (
        req.method === "DELETE"
    ) {

        const limpar =
            String(
                req.query?.limpar ||
                req.body?.limpar ||
                ""
            ).toLowerCase();


        if (
            limpar === "true"
        ) {

            return limparCarrinho(
                req,
                res
            );
        }


        return removerItem(
            req,
            res
        );
    }


    // ========================================================
    // MÉTODO NÃO PERMITIDO
    // ========================================================

    return send(
        res,
        405,
        {
            error:
                "Método não permitido"
        }
    );
}
