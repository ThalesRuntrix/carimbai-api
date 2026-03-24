import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5, // limita conexões
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export default pool;