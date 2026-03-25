export default async function handler(req, res) {

  // 🔥 CORS
  res.setHeader("Access-Control-Allow-Origin", "https://runtrix.com.br");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 🔥 preflight (IMPORTANTE)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { categoria, search, page = 1, limit = 10 } = req.query;    

    let url = `${process.env.SUPABASE_URL}/rest/v1/produtos?select=*,categorias(nome)`;
        

    
    if (categoria) {
      url += `&categoria_id=eq.${categoria}`;      
    } 

    if (search) {
    url += `&nome=ilike.*${search}*`;      
    }

    const from = (page - 1) * limit;
    const to = from + Number(limit) - 1;
    

    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
        Range: `${from}-${to}`,
      },
    });
    
    const data = await response.json();
    
    const produtos = data.map(p => ({
      id: p.id,
      nome: p.nome,
      preco: p.preco,
      categoria: p.categorias?.nome || null,
    }));
    
    res.status(200).json(produtos);

  } catch (err) {
    console.error("ERRO:", err);
    res.status(500).json({ error: "Erro ao buscar produtos" });
  }
}