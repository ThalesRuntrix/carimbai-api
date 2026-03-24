import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3, // limita conexões
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

export default pool;