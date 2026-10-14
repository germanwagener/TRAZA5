const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ejs = require('ejs');

const views = path.join(__dirname, '..', 'views');
const now = new Date('2026-10-14T12:00:00Z');
const common = {
  user: { id: 99, username: 'admin', role: 'superadmin' },
  activeClient: { id: 1, name: 'Cliente Prueba' },
  clientChoices: [{ id: 1, name: 'Cliente Prueba' }],
  sectors: [{ id: 1, name: 'Cocina', position: 1 }],
  flash: null
};
const supplier = { id: 1, name: 'Proveedor Uno', tax_id: '20', contact: 'mail', active: true };
const product = {
  id: 1,
  code: 'MP-1',
  name: 'Salsa',
  category: 'Materia prima',
  unit: 'L',
  default_brand: 'Marca',
  shelf_life_days: 30,
  active: true,
  default_presentation_unit: 'bidón',
  default_content_per_presentation: 5,
  default_content_unit: 'L',
  supplier_ids: [1],
  supplier_names: 'Proveedor Uno',
  supplier_configs: [{ supplier_id: 1, supplier_name: 'Proveedor Uno', presentation_unit: 'bidón', content_per_presentation: 5, content_unit: 'L' }]
};
const receipt = {
  id: 1,
  received_at: now,
  supplier: 'Proveedor Uno',
  product: 'Salsa',
  brand: 'Marca',
  supplier_lot: 'P1',
  internal_lot: 'MP-1-X',
  presentation_qty: 6,
  presentation_unit: 'bidones',
  content_per_presentation: 5,
  content_unit: 'L',
  qty: 30,
  unit: 'L',
  unit_price: 10,
  expires_at: now,
  username: 'admin',
  notes: ''
};
const batch = {
  id: 1,
  produced_at: now,
  produced_date: '2026-10-14',
  sector: 'Cocina',
  product: 'Final',
  recipe: 'Receta',
  version: '1',
  internal_lot: 'I1',
  final_lot: 'F1',
  qty: 2,
  status: 'LIBERADO',
  username: 'admin',
  notes: '',
  date: '2026-10-14',
  expires: '',
  origin: 'Cocina',
  kind: 'Elaborado',
  category: 'Producto terminado',
  original_qty: 2,
  consumed: 0,
  available: 2,
  unit: 'kg'
};

const cases = {
  'login.ejs': {},
  'password.ejs': {},
  'error.ejs': { message: 'x' },
  'dashboard.ejs': { stats: { Productos: 1 }, recent: [batch] },
  'clients.ejs': { rows: [{ id: 1, name: 'Cliente Prueba', sector_count: 1, user_count: 1, active: true }] },
  'users.ejs': { rows: [{ id: 2, username: 'operador', role: 'operator', client_id: 1, client_name: 'Cliente Prueba', active: true }], clients: [{ id: 1, name: 'Cliente Prueba' }], superadmin: true },
  'masters.ejs': { suppliers: [supplier], products: [product], sectorRows: [{ id: 1, name: 'Cocina', position: 1, active: true }] },
  'recipes.ejs': { products: [product], recipes: [{ id: 1, name: 'Receta', version: '1', sector: 'Cocina', output_product: 'Final', output_qty: 1, notes: '', active: true }] },
  'receipts.ejs': { suppliers: [supplier], products: [product], rows: [receipt] },
  'production.ejs': { recipes: [{ id: 1, name: 'Receta', version: '1', sector: 'Cocina', output_product: 'Final' }] },
  'trace.ejs': {
    products: [product],
    matches: [],
    tree: { type: 'receipt', data: { ...receipt, product: 'Salsa' }, children: [] },
    productId: '1',
    lot: 'MP-1-X',
    direction: 'back'
  },
  'stock.ejs': { rows: [batch] },
  'reports.ejs': { rows: [batch] },
  'audit.ejs': { rows: [{ created_at: now, username: 'admin', action: 'CREATE', entity_type: 'product', entity_id: 1, details: {} }] }
};

for (const [file, data] of Object.entries(cases)) {
  test('renderiza ' + file, async () => {
    const html = await ejs.renderFile(path.join(views, file), { ...common, ...data });
    assert.match(html, /<!doctype html>/i);
  });
}
