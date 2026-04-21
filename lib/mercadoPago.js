import mercadopago from "mercadopago";

if (!process.env.MP_ACCESS_TOKEN) {
  throw new Error("MP_ACCESS_TOKEN não definido");
}

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

export default mercadopago;