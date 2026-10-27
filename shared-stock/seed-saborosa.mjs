import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { operate } from './domain.mjs';

export const customers = 'Yoi; Suipacha pool; Vegart; Cementerio el prado; Siglo 21; Anabel; El refugio; Birria; Don garcia; Calu eventos; Oasis; Il papagallo; Il veckio; Genoveba; La zorrita; Piel de toro; Memphis bar; Club bancario; Pizzas del bosque; Hotel mercure; Centralito; Martin pescador; Cosme; Paseo ludueña; Rufinata; Micro go; Alto monte; Piacere; Ger (Gimnasia y esgrima); Universidad Austral; Las heras'.split('; ');
export const materials = 'Premezcla; rebozador; Mostaza; Levadura; Sal; Maicena; Aceite liquido; Aceite vegetal; Arroz; Jamón cocido; Paleta de cerdo; Muzarella; Queso dambo; Salsa de tomate; Pimienta; Orégano; Nuez moscada; Finas hierbas; Provenzal; Manteca; Crema de leche; Queso crema; Filete de pollo; Pollo entero; Carne picada; Carne cuadrada; Nalga; Carne de cerdo con hueso; Carne de cerdo sin hueso; Acelga; Pimientos; Zanahorias; Cebolla; Apio; Puerro; Verdeo; Calabaza; Choclo; Papas noisettes; Papas bastón; Papas smiles; Tapa para empanadas; Leche; Huevo; Papas; Miel; Salsa de soja; Pan de hamburguesa; Pan lactal'.split('; ');
export const normalize = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, ' ').trim();
const digest = value => createHash('sha256').update(value).digest('hex');
const marker = 'seed_saborosa_20261027_v1';

export function seed(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const matches = db.prepare('SELECT * FROM companies').all().filter(c => normalize(c.name) === 'saborosa');
    if (matches.length !== 1) throw Error('Se requiere exactamente una empresa Saborosa.');
    const company = matches[0], state = JSON.parse(company.state);
    if (normalize(state.company) !== 'saborosa') throw Error('Nombre interno de empresa incompatible.');
    if (!Array.isArray(state.customers) || !Array.isArray(state.items) || !Array.isArray(state.suppliers)) throw Error('Estado incompatible.');
    const before = structuredClone(state), addedCustomers = [], addedMaterials = [];
    for (const name of customers) {
      if (state.customers.some(row => normalize(row.name) === normalize(name))) continue;
      operate(state, 'master', { collection: 'customers', name });
      addedCustomers.push(name);
    }
    for (const name of materials) {
      const rows = state.items.filter(row => normalize(row.name) === normalize(name));
      if (rows.some(row => row.kind !== 'raw')) throw Error('Artículo existente con otro tipo: ' + name);
      if (rows.length) continue;
      // kg is the existing application's default for a new raw material.
      operate(state, 'master', { collection: 'items', name, kind: 'raw', unit: 'kg' });
      addedMaterials.push(name);
    }
    const restored = structuredClone(state);
    restored.customers = restored.customers.slice(0, before.customers.length);
    restored.items = restored.items.slice(0, before.items.length);
    if (JSON.stringify(restored) !== JSON.stringify(before)) throw Error('La carga alteró datos existentes.');
    for (const name of customers) if (!state.customers.some(row => normalize(row.name) === normalize(name))) throw Error('Cliente no verificado: ' + name);
    for (const name of materials) if (!state.items.some(row => row.kind === 'raw' && normalize(row.name) === normalize(name))) throw Error('Materia prima no verificada: ' + name);
    const report = {
      marker, companyId: company.id, companyName: company.name,
      beforeHash: digest(company.state),
      addedCustomers, addedMaterials,
      customersTotal: state.customers.length,
      customersActive: state.customers.filter(row => !row.archived).length,
      rawMaterialsTotal: state.items.filter(row => row.kind === 'raw').length,
      suppliersTotal: state.suppliers.length,
      verifiedCustomers: customers.map(name => ({ requested: name, actual: state.customers.filter(row => normalize(row.name) === normalize(name)).map(row => row.name) })),
      verifiedMaterials: materials.map(name => ({ requested: name, actual: state.items.filter(row => normalize(row.name) === normalize(name)).map(row => row.name) })),
      existingRecordsUnchanged: true
    };
    if (addedCustomers.length || addedMaterials.length) {
      const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
      if (!admin) throw Error('Falta administrador para auditoría.');
      db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(state), company.id, company.version);
      db.prepare('INSERT INTO audit(id,at,user_id,company_id,operation,detail) VALUES(?,?,?,?,?,?)').run(randomUUID(), new Date().toISOString(), admin.id, company.id, marker, JSON.stringify(report));
    }
    db.exec('COMMIT');
    return report;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

if (process.env.RAILWAY_SERVICE_ID === 'bf632963-3316-403a-8590-b4b73d4dba9c') {
  if (process.env.RAILWAY_ENVIRONMENT_ID !== '45af37fc-6b19-4c60-95eb-22f91a9eb0a4' || process.env.RAILWAY_VOLUME_MOUNT_PATH !== '/data') throw Error('Entorno de carga incompatible.');
  const path = process.env.DB_PATH || join('/data', 'gestion.sqlite');
  if (path !== '/data/gestion.sqlite' || !existsSync(path)) throw Error('Base persistente existente requerida.');
  const db = new DatabaseSync(path);
  try { db.exec('PRAGMA busy_timeout=15000;'); console.log('SABOROSA_SEED_VERIFIED ' + JSON.stringify(seed(db))); }
  finally { db.close(); }
}
