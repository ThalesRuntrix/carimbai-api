export function formatarPedidoPayload(data) {

  if (!data) {

    throw new Error(
      "Payload vazio"
    );
  }


  // =========================================================
  // CLIENTE
  // =========================================================

  const cpf =
    String(
      data.cpf || ""
    ).replace(
      /\D/g,
      ""
    );


  if (cpf.length !== 11) {

    throw new Error(
      "CPF inválido"
    );
  }


  const nome =
    String(
      data.nome || ""
    ).trim();


  const email =
    String(
      data.email || ""
    ).trim();


  const whatsapp =
    String(
      data.whatsapp || ""
    ).trim();


  if (!nome || !email) {

    throw new Error(
      "Nome e email obrigatórios"
    );
  }


  // =========================================================
  // CARRINHO
  // =========================================================

  const cart_token =
    String(
      data.cart_token || ""
    ).trim();


  if (!cart_token) {

    throw new Error(
      "Carrinho inválido"
    );
  }


  // =========================================================
  // PAGAMENTO
  // =========================================================

  const pagamento =
    String(
      data.pagamento || ""
    ).toLowerCase();


  if (
    ![
      "pix",
      "cartao"
    ].includes(
      pagamento
    )
  ) {

    throw new Error(
      "Pagamento inválido"
    );
  }


  // =========================================================
  // ENTREGA
  // =========================================================

  const entrega =
    String(
      data.entrega || ""
    );


  if (
    ![
      "retirada",
      "frete"
    ].includes(
      entrega
    )
  ) {

    throw new Error(
      "Tipo de entrega inválido"
    );
  }


  // =========================================================
  // FRETE
  // =========================================================

  const frete =
    Number(
      data.frete_valor
    );


  if (
    !Number.isFinite(frete) ||
    frete < 0 ||
    frete > 1000
  ) {

    throw new Error(
      "Frete inválido"
    );
  }


  const prazo =
    Number(
      data.frete_prazo
    ) || 0;


  // =========================================================
  // ENDEREÇO
  // =========================================================

  const endereco = {

    rua:
      String(
        data.rua || ""
      ),

    numero:
      String(
        data.numero || ""
      ),

    bairro:
      String(
        data.bairro || ""
      ),

    cidade:
      String(
        data.cidade || ""
      ),

    estado:
      String(
        data.estado || ""
      ),

    cep:
      String(
        data.cep || ""
      ),

    complemento:
      String(
        data.complemento || ""
      )
  };


  // =========================================================
  // RESULTADO
  // =========================================================

  return {

    cart_token,


    cliente: {

      nome,

      email,

      whatsapp,

      cpf
    },


    endereco,


    pagamento,

    entrega,


    frete,

    prazo,


    transportadora:
      String(
        data.frete_nome || ""
      )

  };
}

/*export function formatarPedidoPayload(data) {
  if (!data) {
    throw new Error("Payload vazio");
  }

  // =========================
  // CLIENTE
  // =========================
  const cpf = String(data.cpf || "").replace(/\D/g, "");

  if (cpf.length !== 11) {
    throw new Error("CPF inválido");
  }

  const nome = String(data.nome || "").trim();
  const email = String(data.email || "").trim();
  const whatsapp = String(data.whatsapp || "").trim();

  if (!nome || !email) {
    throw new Error("Nome e email obrigatórios");
  }

  // =========================
  // PAGAMENTO
  // =========================
  const pagamento = String(data.pagamento || "").toLowerCase();

  const pagamentosValidos = ["pix", "cartao"];

  if (!pagamentosValidos.includes(pagamento)) {
    throw new Error("Pagamento inválido");
  }

  // =========================
  // ENTREGA
  // =========================
  const entrega = String(data.entrega || "");

  const entregasValidas = ["retirada", "frete"];

  if (!entregasValidas.includes(entrega)) {
    throw new Error("Tipo de entrega inválido");
  }

  // =========================
  // FRETE
  // =========================
  const frete = Number(data.frete_valor);

  if (isNaN(frete) || frete < 0 || frete > 1000) {
    throw new Error("Frete inválido");
  }

  const prazo = Number(data.frete_prazo) || 0;

  // =========================
  // PRODUTO + SKU
  // =========================
  const produto_id = Number(data.produto_id);

  if (!Number.isInteger(produto_id) || produto_id <= 0) {
    throw new Error("Produto inválido");
  }

  const produto_sku_id = Number(data.produto_sku_id);

  if (!Number.isInteger(produto_sku_id) || produto_sku_id <= 0) {
    throw new Error("SKU inválido");
  }

  // =========================
  // PERSONALIZAÇÃO
  // =========================
  const personalizacao_txt = data.personalizacao_txt
    ? String(data.personalizacao_txt).slice(0, 500)
    : null;

  const personalizacao_img = data.personalizacao_img
    ? String(data.personalizacao_img)
    : null;

  // =========================
  // ENDEREÇO
  // =========================
  const endereco = {
    rua: String(data.rua || ""),
    numero: String(data.numero || ""),
    bairro: String(data.bairro || ""),
    cidade: String(data.cidade || ""),
    estado: String(data.estado || ""),
    cep: String(data.cep || ""),
    complemento: String(data.complemento || "")
  };

  const variacao = data.variacao
    ? String(data.variacao).trim()
    : null;

  // =========================
  // RESULTADO
  // =========================
  return {
    cliente: {
      nome,
      email,
      whatsapp,
      cpf
    },

    endereco,

    pagamento,
    entrega,

    frete,
    prazo,
    transportadora: String(data.frete_nome || ""),

    itens: [
      {
        produto_id,
        produto_sku_id,
        quantidade: 1,
        preco_unitario: 0,
        personalizacao_txt,
        personalizacao_img,
        variacao
      }
    ]
  };
}
*/
