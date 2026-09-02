const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return { name, value: value.trim() };
  }
  return null;
}

const urlSetting = firstEnv(
  'DATABASE_URL',
  'DATABASE_PUBLIC_URL',
  'POSTGRES_URL',
  'POSTGRESQL_URL'
);

function sslFor(hostOrUrl = '') {
  const explicit = String(process.env.DB_SSL || '').toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(explicit)) return false;
  if (['1', 'true', 'yes', 'on'].includes(explicit)) return { rejectUnauthorized: false };
  if (String(process.env.PGSSLMODE || '').toLowerCase() === 'disable') return false;

  const target = String(hostOrUrl).toLowerCase();
  if (
    target.includes('localhost') ||
    target.includes('127.0.0.1') ||
    target.includes('@db:') ||
    target.includes('.railway.internal')
  ) return false;

  return process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;
}

let databaseConfigSource = null;
let poolConfig = {};

if (urlSetting) {
  databaseConfigSource = urlSetting.name;
  poolConfig = {
    connectionString: urlSetting.value,
    ssl: sslFor(urlSetting.value)
  };
} else if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
  databaseConfigSource = 'PGHOST/PGUSER/PGDATABASE';
  poolConfig = {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: sslFor(process.env.PGHOST)
  };
}

const pool = new Pool(poolConfig);

async function initDb() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);
  const defaultClient = await pool.query('SELECT id FROM clients ORDER BY id LIMIT 1');
  const clientId = defaultClient.rows[0].id;
  const count = await pool.query('SELECT COUNT(*)::int n FROM sectors WHERE client_id=$1', [clientId]);
  if (count.rows[0].n === 0) {
    for (let i = 1; i <= 5; i++) {
      await pool.query(
        'INSERT INTO sectors(client_id,name,position) VALUES($1,$2,$3)',
        [clientId, `Sector ${i}`, i]
      );
    }
  }
}

async function audit(userId, clientId, action, entityType, entityId, details = {}) {
  await pool.query(
    'INSERT INTO audit_log(user_id,client_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
    [userId || null, clientId || null, action, entityType, entityId || null, JSON.stringify(details)]
  );
}

module.exports = {
  pool,
  initDb,
  audit,
  hasDatabaseConfig: () => Boolean(databaseConfigSource),
  databaseConfigSource
};
