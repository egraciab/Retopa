const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,                   // máx conexiones simultáneas
  min: 2,                    // conexiones mínimas listas en espera
  idleTimeoutMillis: 30000,  // cerrar conexión idle después de 30s
  connectionTimeoutMillis: 5000, // error si no consigue conexión en 5s
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

module.exports = pool;
