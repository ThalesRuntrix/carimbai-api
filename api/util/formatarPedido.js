export function formatarPedidoPayload(data) {
  // 🔹 limpa CPF (remove pontos e traços)
  const cpfLimpo = data.cpf.replace(/\D/g, "");

  return {
    cliente: {
      nome: data.nome,
      email: data.email,
      cpf: cpfLimpo,
    },

    endereco: {
      rua: data.rua,
      numero: data.numero,
      bairro: data.bairro,
      cidade: data.cidade,
      estado: data.estado,
      cep: data.cep,
      complemento: data.complemento || "",
    },

    pagamento: data.pagamento?.toLowerCase(), // padroniza
    entrega: data.entrega,

    frete: Number(data.frete_valor) || 0,
    prazo: Number(data.frete_prazo) || 0,
    transportadora: data.frete_nome || "",

    itens: [
      {
        produto_id: Number(data.produto_id),
        quantidade: 1, // por enquanto fixo
        preco_unitario: 0, // ⚠️ vamos falar disso abaixo
        personalizacao_txt: data.personalizacao_txt || null,
        personalizacao_img: data.personalizacao_img ||null,
      },
    ],
  };
}