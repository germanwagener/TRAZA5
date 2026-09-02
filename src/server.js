require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { pool, initDb, audit, hasDatabaseConfig, databaseConfigSource } = require('./db');
const { backward, forward } = require('./trace');

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.use(session({
  store: new pgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'CAMBIAR-ESTE-SECRETO',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  const role = req.session.user && req.session.user.role;
  if (!['superadmin', 'admin'].includes(role)) {
    return res.status(403).render('error', { message: 'Solo un administrador puede realizar esta acción.' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'superadmin') {
    return res.status(403).render('error', { message: 'Solo la administración general puede realizar esta acción.' });
  }
  next();
}

function requireClient(req, res, next) {
  if (!req.context || !req.context.clientId) {
    flash(req, 'error', 'Primero creá o seleccioná una empresa cliente.');
    return res.redirect('/admin/clients');
  }
  next();
}

function currentClientId(req) {
  return Number(req.context && req.context.clientId) || 0;
}

function isSuperAdmin(req) {
  return Boolean(req.session.user && req.session.user.role === 'superadmin');
}

app.use(asyncRoute(async (req, res, next) => {
  res.locals.user = null;
  res.locals.activeClient = null;
  res.locals.clientChoices = [];
  res.locals.sectors = [];
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;

  if (!req.session.user) return next();

  const userResult = await pool.query(
    'SELECT u.id,u.username,u.role,u.client_id,c.name client_name,c.active client_active FROM users u LEFT JOIN clients c ON c.id=u.client_id WHERE u.id=$1 AND u.active=TRUE',
    [req.session.user.id]
  );
  const user = userResult.rows[0];
  if (!user || (user.role !== 'superadmin' && !user.client_active)) {
    return req.session.destroy(() => res.redirect('/login'));
  }

  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    client_id: user.client_id || null
  };

  let clientChoices = [];
  let activeClient = null;
  if (user.role === 'superadmin') {
    clientChoices = (await pool.query(
      'SELECT id,name FROM clients WHERE active=TRUE ORDER BY name'
    )).rows;
    const requestedId = Number(req.session.activeClientId);
    activeClient = clientChoices.find(row => Number(row.id) === requestedId) || clientChoices[0] || null;
    req.session.activeClientId = activeClient ? activeClient.id : null;
  } else {
    activeClient = { id: user.client_id, name: user.client_name };
  }

  req.context = {
    user,
    clientId: activeClient ? Number(activeClient.id) : null,
    client: activeClient
  };
  res.locals.user = req.session.user;
  res.locals.activeClient = activeClient;
  res.locals.clientChoices = clientChoices;
  if (activeClient) {
    res.locals.sectors = (await pool.query(
      'SELECT id,name,position FROM sectors WHERE client_id=$1 AND active=TRUE ORDER BY position,name',
      [activeClient.id]
    )).rows;
  }
  next();
}));

async function seedAdmin() {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'admin123';
  const found = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
  if (found.rowCount === 0) {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO users(username,password_hash,role,client_id) VALUES($1,$2,'superadmin',NULL)",
      [username, hash]
    );
  }
}

app.get('/login', (req, res) => res.render('login'));

app.post('/login', asyncRoute(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const result = await pool.query(
    'SELECT u.*,c.active client_active FROM users u LEFT JOIN clients c ON c.id=u.client_id WHERE u.username=$1 AND u.active=TRUE',
    [username]
  );
  const user = result.rows[0];
  const passwordOk = user && await bcrypt.compare(String(req.body.password || ''), user.password_hash);
  const clientOk = user && (user.role === 'superadmin' || (user.client_id && user.client_active));
  if (!passwordOk || !clientOk) {
    flash(req, 'error', 'Usuario o contraseña incorrectos.');
    return res.redirect('/login');
  }
  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    client_id: user.client_id || null
  };
  if (user.role === 'superadmin') {
    const firstClient = await pool.query('SELECT id FROM clients WHERE active=TRUE ORDER BY name LIMIT 1');
    req.session.activeClientId = firstClient.rows[0] ? firstClient.rows[0].id : null;
  }
  await audit(user.id, user.client_id, 'LOGIN', 'user', user.id, {});
  res.redirect('/');
}));

app.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const [products, suppliers, recipes, receipts, batches, recent] = await Promise.all([
    pool.query('SELECT COUNT(*)::int n FROM products WHERE client_id=$1 AND active=TRUE', [clientId]),
    pool.query('SELECT COUNT(*)::int n FROM suppliers WHERE client_id=$1 AND active=TRUE', [clientId]),
    pool.query('SELECT COUNT(*)::int n FROM recipes WHERE client_id=$1 AND active=TRUE', [clientId]),
    pool.query('SELECT COUNT(*)::int n FROM receipts WHERE client_id=$1', [clientId]),
    pool.query('SELECT COUNT(*)::int n FROM batches WHERE client_id=$1', [clientId]),
    pool.query(
      'SELECT b.id,b.internal_lot,b.final_lot,b.qty,b.produced_at,b.status,p.name product,s.name sector FROM batches b JOIN products p ON p.id=b.product_id AND p.client_id=b.client_id JOIN sectors s ON s.id=b.sector_id AND s.client_id=b.client_id WHERE b.client_id=$1 ORDER BY b.created_at DESC LIMIT 12',
      [clientId]
    )
  ]);
  res.render('dashboard', {
    stats: {
      Productos: products.rows[0].n,
      Proveedores: suppliers.rows[0].n,
      Recetas: recipes.rows[0].n,
      Ingresos: receipts.rows[0].n,
      Elaboraciones: batches.rows[0].n
    },
    recent: recent.rows
  });
}));

app.get('/admin/clients', requireSuperAdmin, asyncRoute(async (req, res) => {
  const rows = (await pool.query(
    'SELECT c.*,COUNT(DISTINCT s.id)::int sector_count,COUNT(DISTINCT u.id)::int user_count FROM clients c LEFT JOIN sectors s ON s.client_id=c.id AND s.active=TRUE LEFT JOIN users u ON u.client_id=c.id AND u.active=TRUE GROUP BY c.id ORDER BY c.active DESC,c.name'
  )).rows;
  res.render('clients', { rows });
}));

app.post('/admin/clients', requireSuperAdmin, asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const sectorCount = Math.max(1, Math.min(20, Number(req.body.sector_count) || 1));
  const client = await pool.connect();
  let createdId = null;
  try {
    if (!name) throw new Error('Ingresá el nombre de la empresa.');
    await client.query('BEGIN');
    const inserted = await client.query(
      'INSERT INTO clients(name) VALUES($1) RETURNING id',
      [name]
    );
    createdId = inserted.rows[0].id;
    for (let position = 1; position <= sectorCount; position += 1) {
      await client.query(
        'INSERT INTO sectors(client_id,name,position) VALUES($1,$2,$3)',
        [createdId, 'Sector ' + position, position]
      );
    }
    await client.query('COMMIT');
    req.session.activeClientId = createdId;
    await audit(req.session.user.id, createdId, 'CREATE', 'client', createdId, { name, sector_count: sectorCount });
    flash(req, 'ok', 'Empresa creada con ' + sectorCount + ' sector' + (sectorCount === 1 ? '' : 'es') + '.');
  } catch (error) {
    await client.query('ROLLBACK');
    flash(req, 'error', error.code === '23505' ? 'Ya existe una empresa con ese nombre.' : (error.message || 'No se pudo crear la empresa.'));
  } finally {
    client.release();
  }
  res.redirect('/admin/clients');
}));

app.post('/admin/clients/:id/select', requireSuperAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT id FROM clients WHERE id=$1 AND active=TRUE', [req.params.id]);
  if (!result.rows[0]) {
    flash(req, 'error', 'La empresa no está disponible.');
    return res.redirect('/admin/clients');
  }
  req.session.activeClientId = result.rows[0].id;
  res.redirect('/');
}));

app.post('/admin/clients/:id/update', requireSuperAdmin, asyncRoute(async (req, res) => {
  const name = String(req.body.name || '').trim();
  try {
    if (!name) throw new Error('Ingresá el nombre de la empresa.');
    const result = await pool.query('UPDATE clients SET name=$1 WHERE id=$2 RETURNING id', [name, req.params.id]);
    if (!result.rows[0]) throw new Error('Empresa inexistente.');
    await audit(req.session.user.id, req.params.id, 'UPDATE', 'client', req.params.id, { name });
    flash(req, 'ok', 'Nombre de la empresa actualizado.');
  } catch (error) {
    flash(req, 'error', error.code === '23505' ? 'Ya existe una empresa con ese nombre.' : (error.message || 'No se pudo actualizar.'));
  }
  res.redirect('/admin/clients');
}));

app.post('/admin/clients/:id/toggle', requireSuperAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query(
    'UPDATE clients SET active=NOT active WHERE id=$1 RETURNING id,name,active',
    [req.params.id]
  );
  if (result.rows[0]) {
    await audit(req.session.user.id, req.params.id, 'TOGGLE', 'client', req.params.id, { active: result.rows[0].active });
    flash(req, 'ok', result.rows[0].active ? 'Empresa activada.' : 'Empresa desactivada.');
  }
  res.redirect('/admin/clients');
}));

app.post('/admin/client-context', requireSuperAdmin, asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT id FROM clients WHERE id=$1 AND active=TRUE', [req.body.client_id]);
  if (result.rows[0]) req.session.activeClientId = result.rows[0].id;
  res.redirect('/');
}));

app.get('/admin/users', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const superadmin = isSuperAdmin(req);
  const rows = (await pool.query(
    superadmin
      ? "SELECT u.id,u.username,u.role,u.active,u.created_at,c.name client_name FROM users u LEFT JOIN clients c ON c.id=u.client_id WHERE u.role<>'superadmin' ORDER BY c.name,u.username"
      : 'SELECT u.id,u.username,u.role,u.active,u.created_at,c.name client_name FROM users u JOIN clients c ON c.id=u.client_id WHERE u.client_id=$1 ORDER BY u.username',
    superadmin ? [] : [clientId]
  )).rows;
  const clients = superadmin
    ? (await pool.query('SELECT id,name FROM clients WHERE active=TRUE ORDER BY name')).rows
    : [];
  res.render('users', { rows, clients, superadmin });
}));

app.post('/admin/users', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const superadmin = isSuperAdmin(req);
  const targetClientId = superadmin ? Number(req.body.client_id) : currentClientId(req);
  const role = superadmin && req.body.role === 'admin' ? 'admin' : 'operator';
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (!username || password.length < 8) {
    flash(req, 'error', 'Ingresá un usuario y una contraseña inicial de al menos 8 caracteres.');
    return res.redirect('/admin/users');
  }
  const target = await pool.query('SELECT id FROM clients WHERE id=$1 AND active=TRUE', [targetClientId]);
  if (!target.rows[0]) {
    flash(req, 'error', 'Seleccioná una empresa válida.');
    return res.redirect('/admin/users');
  }
  const hash = await bcrypt.hash(password, 12);
  try {
    const inserted = await pool.query(
      'INSERT INTO users(username,password_hash,role,client_id) VALUES($1,$2,$3,$4) RETURNING id',
      [username, hash, role, targetClientId]
    );
    await audit(req.session.user.id, targetClientId, 'CREATE', 'user', inserted.rows[0].id, {
      username: req.body.username,
      role
    });
    flash(req, 'ok', 'Usuario creado y vinculado a su empresa.');
  } catch (error) {
    flash(req, 'error', error.code === '23505' ? 'Ese nombre de usuario ya existe.' : 'No se pudo crear el usuario.');
  }
  res.redirect('/admin/users');
}));

app.post('/admin/users/:id/toggle', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const result = await pool.query(
    isSuperAdmin(req)
      ? "UPDATE users SET active=NOT active WHERE id=$1 AND id<>$2 AND role<>'superadmin' RETURNING id,client_id,active"
      : "UPDATE users SET active=NOT active WHERE id=$1 AND id<>$2 AND client_id=$3 AND role='operator' RETURNING id,client_id,active",
    isSuperAdmin(req)
      ? [req.params.id, req.session.user.id]
      : [req.params.id, req.session.user.id, clientId]
  );
  if (result.rows[0]) {
    await audit(req.session.user.id, result.rows[0].client_id, 'TOGGLE', 'user', req.params.id, { active: result.rows[0].active });
  }
  res.redirect('/admin/users');
}));

app.get('/account/password', requireAuth, (req, res) => res.render('password'));

app.post('/account/password', requireAuth, asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.session.user.id]);
  const currentOk = result.rows[0] && await bcrypt.compare(String(req.body.current || ''), result.rows[0].password_hash);
  if (!currentOk || req.body.password !== req.body.confirm) {
    flash(req, 'error', 'Revisá la contraseña actual y que las nuevas coincidan.');
    return res.redirect('/account/password');
  }
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
    await bcrypt.hash(req.body.password, 12),
    req.session.user.id
  ]);
  await audit(req.session.user.id, currentClientId(req) || null, 'PASSWORD_CHANGE', 'user', req.session.user.id, {});
  flash(req, 'ok', 'Contraseña actualizada.');
  res.redirect('/');
}));

app.get('/admin/masters', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const [suppliers, products, sectors] = await Promise.all([
    pool.query('SELECT * FROM suppliers WHERE client_id=$1 ORDER BY active DESC,name', [clientId]),
    pool.query(
      "SELECT p.*,COALESCE(ARRAY_AGG(ps.supplier_id ORDER BY ps.supplier_id) FILTER (WHERE ps.supplier_id IS NOT NULL),'{}') supplier_ids,COALESCE(STRING_AGG(s.name, ', ' ORDER BY s.name),'') supplier_names FROM products p LEFT JOIN product_suppliers ps ON ps.product_id=p.id AND ps.client_id=p.client_id LEFT JOIN suppliers s ON s.id=ps.supplier_id AND s.client_id=p.client_id WHERE p.client_id=$1 GROUP BY p.id ORDER BY p.active DESC,p.name",
      [clientId]
    ),
    pool.query('SELECT * FROM sectors WHERE client_id=$1 ORDER BY active DESC,position,name', [clientId])
  ]);
  res.render('masters', {
    suppliers: suppliers.rows,
    products: products.rows,
    sectorRows: sectors.rows
  });
}));

app.post('/admin/suppliers', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  try {
    const inserted = await pool.query(
      'INSERT INTO suppliers(client_id,name,tax_id,contact) VALUES($1,$2,$3,$4) RETURNING id',
      [clientId, String(req.body.name || '').trim(), req.body.tax_id || '', req.body.contact || '']
    );
    await audit(req.session.user.id, clientId, 'CREATE', 'supplier', inserted.rows[0].id, { name: req.body.name });
    flash(req, 'ok', 'Proveedor agregado.');
  } catch (error) {
    flash(req, 'error', 'No se pudo agregar el proveedor. Puede que ya exista en esta empresa.');
  }
  res.redirect('/admin/masters');
}));

app.post('/admin/products', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const supplierIds = [...new Set(
      [].concat(req.body.supplier_id || []).filter(Boolean).map(Number)
    )];
    if (supplierIds.length) {
      const validSuppliers = await client.query(
        'SELECT id FROM suppliers WHERE client_id=$1 AND active=TRUE AND id=ANY($2::bigint[])',
        [clientId, supplierIds]
      );
      if (validSuppliers.rowCount !== supplierIds.length) {
        throw new Error('Uno de los proveedores no pertenece a la empresa seleccionada.');
      }
    }
    const inserted = await client.query(
      "INSERT INTO products(client_id,code,name,category,unit,default_brand,shelf_life_days) VALUES($1,NULLIF($2,''),$3,$4,$5,$6,$7) RETURNING id",
      [
        clientId,
        req.body.code || '',
        String(req.body.name || '').trim(),
        req.body.category,
        req.body.unit,
        req.body.default_brand || '',
        Number(req.body.shelf_life_days || 0)
      ]
    );
    for (const supplierId of supplierIds) {
      await client.query(
        'INSERT INTO product_suppliers(client_id,product_id,supplier_id) VALUES($1,$2,$3)',
        [clientId, inserted.rows[0].id, supplierId]
      );
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, clientId, 'CREATE', 'product', inserted.rows[0].id, { name: req.body.name });
    const productMessage = supplierIds.length === 0
      ? 'Producto agregado sin proveedor externo.'
      : (supplierIds.length === 1
        ? 'Producto agregado con su proveedor.'
        : 'Producto agregado con ' + supplierIds.length + ' proveedores habilitados.');
    flash(req, 'ok', productMessage);
  } catch (error) {
    await client.query('ROLLBACK');
    flash(req, 'error', error.code === '23505'
      ? 'No se pudo agregar el producto. Revisá que el código no esté repetido dentro de esta empresa.'
      : (error.message || 'No se pudo agregar el producto.'));
  } finally {
    client.release();
  }
  res.redirect('/admin/masters');
}));

app.post('/admin/products/:id/suppliers', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const product = await client.query(
      'SELECT id FROM products WHERE id=$1 AND client_id=$2',
      [req.params.id, clientId]
    );
    if (!product.rows[0]) throw new Error('El producto no pertenece a la empresa seleccionada.');
    const supplierIds = [...new Set(
      [].concat(req.body.supplier_id || []).filter(Boolean).map(Number)
    )];
    if (supplierIds.length) {
      const validSuppliers = await client.query(
        'SELECT id FROM suppliers WHERE client_id=$1 AND active=TRUE AND id=ANY($2::bigint[])',
        [clientId, supplierIds]
      );
      if (validSuppliers.rowCount !== supplierIds.length) {
        throw new Error('Uno de los proveedores no pertenece a la empresa seleccionada.');
      }
    }
    await client.query(
      'DELETE FROM product_suppliers WHERE product_id=$1 AND client_id=$2',
      [req.params.id, clientId]
    );
    for (const supplierId of supplierIds) {
      await client.query(
        'INSERT INTO product_suppliers(client_id,product_id,supplier_id) VALUES($1,$2,$3)',
        [clientId, req.params.id, supplierId]
      );
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, clientId, 'UPDATE_SUPPLIERS', 'product', req.params.id, { supplier_ids: supplierIds });
    flash(req, 'ok', 'Proveedores del producto actualizados.');
  } catch (error) {
    await client.query('ROLLBACK');
    flash(req, 'error', error.message || 'No se pudieron actualizar los proveedores.');
  } finally {
    client.release();
  }
  res.redirect('/admin/masters');
}));

app.post('/admin/sectors', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  try {
    const positionResult = await pool.query(
      'SELECT COALESCE(MAX(position),0)+1 position FROM sectors WHERE client_id=$1',
      [clientId]
    );
    const inserted = await pool.query(
      'INSERT INTO sectors(client_id,name,position) VALUES($1,$2,$3) RETURNING id',
      [clientId, String(req.body.name || '').trim(), positionResult.rows[0].position]
    );
    await audit(req.session.user.id, clientId, 'CREATE', 'sector', inserted.rows[0].id, { name: req.body.name });
    flash(req, 'ok', 'Sector agregado.');
  } catch (error) {
    flash(req, 'error', 'No se pudo agregar el sector. Revisá que el nombre no esté repetido.');
  }
  res.redirect('/admin/masters');
}));

app.post('/admin/sectors/:id', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  try {
    const result = await pool.query(
      'UPDATE sectors SET name=$1,position=$2 WHERE id=$3 AND client_id=$4 RETURNING id',
      [String(req.body.name || '').trim(), Number(req.body.position), req.params.id, clientId]
    );
    if (result.rows[0]) {
      await audit(req.session.user.id, clientId, 'UPDATE', 'sector', req.params.id, { name: req.body.name });
      flash(req, 'ok', 'Sector actualizado.');
    }
  } catch (error) {
    flash(req, 'error', 'No se pudo actualizar el sector. Revisá que el nombre no esté repetido.');
  }
  res.redirect('/admin/masters');
}));

app.post('/admin/sectors/:id/toggle', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const result = await pool.query(
    'UPDATE sectors SET active=NOT active WHERE id=$1 AND client_id=$2 RETURNING id,active',
    [req.params.id, clientId]
  );
  if (result.rows[0]) {
    await audit(req.session.user.id, clientId, 'TOGGLE', 'sector', req.params.id, { active: result.rows[0].active });
    flash(req, 'ok', result.rows[0].active ? 'Sector activado.' : 'Sector desactivado.');
  }
  res.redirect('/admin/masters');
}));

app.get('/admin/recipes', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const [products, recipes] = await Promise.all([
    pool.query(
      "SELECT p.id,p.name,p.category,p.unit,COALESCE(STRING_AGG(s.name, ', ' ORDER BY s.name),'') supplier_names FROM products p LEFT JOIN product_suppliers ps ON ps.product_id=p.id AND ps.client_id=p.client_id LEFT JOIN suppliers s ON s.id=ps.supplier_id AND s.client_id=p.client_id WHERE p.client_id=$1 AND p.active=TRUE GROUP BY p.id ORDER BY p.name",
      [clientId]
    ),
    pool.query(
      'SELECT r.*,s.name sector,p.name output_product FROM recipes r JOIN sectors s ON s.id=r.sector_id AND s.client_id=r.client_id JOIN products p ON p.id=r.output_product_id AND p.client_id=r.client_id WHERE r.client_id=$1 ORDER BY s.position,r.name,r.version',
      [clientId]
    )
  ]);
  res.render('recipes', { products: products.rows, recipes: recipes.rows });
}));

app.post('/admin/recipes', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sector = await client.query(
      'SELECT id FROM sectors WHERE id=$1 AND client_id=$2 AND active=TRUE',
      [req.body.sector_id, clientId]
    );
    const output = await client.query(
      'SELECT id FROM products WHERE id=$1 AND client_id=$2 AND active=TRUE',
      [req.body.output_product_id, clientId]
    );
    if (!sector.rows[0] || !output.rows[0]) throw new Error('El sector o el producto no pertenece a la empresa seleccionada.');

    const productIds = [].concat(req.body.input_product_id || []).filter(Boolean);
    const quantities = [].concat(req.body.input_qty || []);
    const uniqueProductIds = [...new Set(productIds.map(Number))];
    if (uniqueProductIds.length) {
      const validProducts = await client.query(
        'SELECT id FROM products WHERE client_id=$1 AND active=TRUE AND id=ANY($2::bigint[])',
        [clientId, uniqueProductIds]
      );
      if (validProducts.rowCount !== uniqueProductIds.length) {
        throw new Error('Uno de los ingredientes no pertenece a la empresa seleccionada.');
      }
    }

    const recipeResult = await client.query(
      'INSERT INTO recipes(client_id,name,sector_id,output_product_id,output_qty,version,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [
        clientId,
        String(req.body.name || '').trim(),
        req.body.sector_id,
        req.body.output_product_id,
        Number(req.body.output_qty),
        req.body.version || '1.0',
        req.body.notes || ''
      ]
    );
    const recipeId = recipeResult.rows[0].id;
    for (let index = 0; index < productIds.length; index += 1) {
      if (productIds[index] && Number(quantities[index]) > 0) {
        await client.query(
          'INSERT INTO recipe_items(recipe_id,product_id,qty) VALUES($1,$2,$3)',
          [recipeId, productIds[index], Number(quantities[index])]
        );
      }
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, clientId, 'CREATE', 'recipe', recipeId, {
      name: req.body.name,
      version: req.body.version
    });
    flash(req, 'ok', 'Receta creada.');
  } catch (error) {
    await client.query('ROLLBACK');
    flash(req, 'error', error.message || 'No se pudo crear la receta.');
  } finally {
    client.release();
  }
  res.redirect('/admin/recipes');
}));

app.get('/receipts', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const [suppliers, products, rows] = await Promise.all([
    pool.query('SELECT id,name FROM suppliers WHERE client_id=$1 AND active=TRUE ORDER BY name', [clientId]),
    pool.query(
      "SELECT p.id,p.name,p.category,p.unit,p.default_brand,p.shelf_life_days,COALESCE(ARRAY_AGG(ps.supplier_id ORDER BY ps.supplier_id) FILTER (WHERE ps.supplier_id IS NOT NULL),'{}') supplier_ids,COALESCE(STRING_AGG(s.name, ', ' ORDER BY s.name),'') supplier_names FROM products p LEFT JOIN product_suppliers ps ON ps.product_id=p.id AND ps.client_id=p.client_id LEFT JOIN suppliers s ON s.id=ps.supplier_id AND s.client_id=p.client_id WHERE p.client_id=$1 AND p.active=TRUE GROUP BY p.id ORDER BY p.name",
      [clientId]
    ),
    pool.query(
      'SELECT r.*,p.name product,s.name supplier,u.username FROM receipts r JOIN products p ON p.id=r.product_id AND p.client_id=r.client_id JOIN suppliers s ON s.id=r.supplier_id AND s.client_id=r.client_id JOIN users u ON u.id=r.created_by WHERE r.client_id=$1 ORDER BY r.created_at DESC LIMIT 300',
      [clientId]
    )
  ]);
  res.render('receipts', { suppliers: suppliers.rows, products: products.rows, rows: rows.rows });
}));

app.post('/receipts', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const [productResult, supplierResult] = await Promise.all([
    pool.query(
      'SELECT p.unit,p.shelf_life_days,EXISTS(SELECT 1 FROM product_suppliers ps WHERE ps.product_id=p.id AND ps.client_id=p.client_id) has_configured_suppliers,EXISTS(SELECT 1 FROM product_suppliers ps WHERE ps.product_id=p.id AND ps.supplier_id=$3 AND ps.client_id=p.client_id) supplier_allowed FROM products p WHERE p.id=$1 AND p.client_id=$2 AND p.active=TRUE',
      [req.body.product_id, clientId, req.body.supplier_id]
    ),
    pool.query(
      'SELECT id FROM suppliers WHERE id=$1 AND client_id=$2 AND active=TRUE',
      [req.body.supplier_id, clientId]
    )
  ]);
  const product = productResult.rows[0];
  if (!product || !supplierResult.rows[0]) {
    flash(req, 'error', 'El proveedor o el producto no pertenece a la empresa seleccionada.');
    return res.redirect('/receipts');
  }
  if (product.has_configured_suppliers && !product.supplier_allowed) {
    flash(req, 'error', 'Ese proveedor no está habilitado para el producto seleccionado.');
    return res.redirect('/receipts');
  }

  let expires = req.body.expires_at || null;
  if (!expires && Number(product.shelf_life_days) > 0) {
    const date = new Date(req.body.received_at + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + Number(product.shelf_life_days));
    expires = date.toISOString().slice(0, 10);
  }
  const lot = 'MP-' + clientId + '-' + Date.now().toString(36).toUpperCase();
  const inserted = await pool.query(
    'INSERT INTO receipts(client_id,supplier_id,product_id,brand,supplier_lot,internal_lot,qty,unit,unit_price,received_at,expires_at,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
    [
      clientId,
      req.body.supplier_id,
      req.body.product_id,
      req.body.brand || '',
      req.body.supplier_lot || '',
      lot,
      Number(req.body.qty),
      product.unit,
      Number(req.body.unit_price || 0),
      req.body.received_at,
      expires,
      req.body.notes || '',
      req.session.user.id
    ]
  );
  await audit(req.session.user.id, clientId, 'CREATE', 'receipt', inserted.rows[0].id, {
    internal_lot: lot,
    qty: req.body.qty
  });
  flash(req, 'ok', 'Ingreso registrado. Lote interno: ' + lot);
  res.redirect('/receipts');
}));

async function availableSource(client, clientId, type, id) {
  if (type === 'receipt') {
    const result = await client.query(
      "SELECT r.product_id,r.qty-COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='receipt' AND bi.source_id=r.id AND consumer.client_id=$2),0) available FROM receipts r WHERE r.id=$1 AND r.client_id=$2 FOR UPDATE",
      [id, clientId]
    );
    return result.rows[0] || null;
  }
  const result = await client.query(
    "SELECT b.product_id,b.status,b.qty-COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='batch' AND bi.source_id=b.id AND consumer.client_id=$2),0) available FROM batches b WHERE b.id=$1 AND b.client_id=$2 FOR UPDATE",
    [id, clientId]
  );
  return result.rows[0] || null;
}

app.get('/production', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const recipes = (await pool.query(
    'SELECT r.id,r.name,r.version,r.sector_id,r.output_product_id,p.name output_product,s.name sector FROM recipes r JOIN products p ON p.id=r.output_product_id AND p.client_id=r.client_id JOIN sectors s ON s.id=r.sector_id AND s.client_id=r.client_id WHERE r.client_id=$1 AND r.active=TRUE AND s.active=TRUE ORDER BY s.position,r.name',
    [clientId]
  )).rows;
  res.render('production', { recipes });
}));

app.get('/api/recipe/:id', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const recipe = (await pool.query(
    'SELECT r.*,p.name output_product,p.unit output_unit,s.name sector FROM recipes r JOIN products p ON p.id=r.output_product_id AND p.client_id=r.client_id JOIN sectors s ON s.id=r.sector_id AND s.client_id=r.client_id WHERE r.id=$1 AND r.client_id=$2',
    [req.params.id, clientId]
  )).rows[0];
  if (!recipe) return res.status(404).json({ error: 'Receta no encontrada.' });
  const items = (await pool.query(
    'SELECT ri.product_id,ri.qty,p.name,p.unit,p.category FROM recipe_items ri JOIN recipes r ON r.id=ri.recipe_id JOIN products p ON p.id=ri.product_id AND p.client_id=r.client_id WHERE ri.recipe_id=$1 AND r.client_id=$2 ORDER BY p.name',
    [req.params.id, clientId]
  )).rows;
  res.json({ recipe, items });
}));

app.get('/api/lots/:productId', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const rows = (await pool.query(
    "SELECT 'receipt' source_type,r.id source_id,r.internal_lot lot,r.received_at::text date,r.expires_at::text expires,(r.qty-COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='receipt' AND bi.source_id=r.id AND consumer.client_id=$2),0)) available,s.name origin FROM receipts r JOIN suppliers s ON s.id=r.supplier_id AND s.client_id=r.client_id WHERE r.product_id=$1 AND r.client_id=$2 UNION ALL SELECT 'batch',b.id,b.internal_lot,b.produced_at::date::text,NULL,(b.qty-COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='batch' AND bi.source_id=b.id AND consumer.client_id=$2),0)),sec.name FROM batches b JOIN sectors sec ON sec.id=b.sector_id AND sec.client_id=b.client_id WHERE b.product_id=$1 AND b.client_id=$2 AND b.status='LIBERADO' ORDER BY date,lot",
    [req.params.productId, clientId]
  )).rows;
  res.json(rows.filter(row => Number(row.available) > 0));
}));

app.post('/production', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recipe = (await client.query(
      'SELECT * FROM recipes WHERE id=$1 AND client_id=$2 AND active=TRUE',
      [req.body.recipe_id, clientId]
    )).rows[0];
    if (!recipe) throw new Error('Receta inválida para la empresa seleccionada.');

    const allowedProducts = new Set((await client.query(
      'SELECT ri.product_id FROM recipe_items ri JOIN products p ON p.id=ri.product_id WHERE ri.recipe_id=$1 AND p.client_id=$2',
      [recipe.id, clientId]
    )).rows.map(row => Number(row.product_id)));
    const types = [].concat(req.body.source_type || []);
    const ids = [].concat(req.body.source_id || []);
    const productIds = [].concat(req.body.source_product_id || []);
    const quantities = [].concat(req.body.source_qty || []);
    if (!ids.length) throw new Error('Seleccioná al menos un lote utilizado.');

    for (let index = 0; index < ids.length; index += 1) {
      const quantity = Number(quantities[index]);
      if (!ids[index] || quantity <= 0) continue;
      if (!['receipt', 'batch'].includes(types[index])) {
        throw new Error('El tipo de lote seleccionado no es válido.');
      }
      if (!allowedProducts.has(Number(productIds[index]))) {
        throw new Error('Uno de los componentes no pertenece a la receta seleccionada.');
      }
      const source = await availableSource(client, clientId, types[index], ids[index]);
      if (!source) throw new Error('Uno de los lotes seleccionados no pertenece a esta empresa o ya no existe.');
      const available = Number(source.available || 0);
      if (Number(source.product_id) !== Number(productIds[index])) {
        throw new Error('El producto del lote no coincide con el componente de la receta.');
      }
      if (quantity > available + 1e-9) {
        throw new Error('Stock insuficiente para uno de los lotes. Disponible ' + available);
      }
      if (types[index] === 'batch' && source.status !== 'LIBERADO') {
        throw new Error('Se intentó usar un lote no liberado.');
      }
    }

    const internalLot = 'INT-' + clientId + '-' + Date.now().toString(36).toUpperCase();
    const finalLot = String(req.body.final_lot || '').trim() || ('LF-' + clientId + '-' + Date.now().toString(36).toUpperCase());
    const batchResult = await client.query(
      "INSERT INTO batches(client_id,recipe_id,sector_id,product_id,internal_lot,final_lot,qty,produced_at,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'LIBERADO',$9,$10) RETURNING id",
      [
        clientId,
        recipe.id,
        recipe.sector_id,
        recipe.output_product_id,
        internalLot,
        finalLot,
        Number(req.body.output_qty),
        req.body.produced_at,
        req.body.notes || '',
        req.session.user.id
      ]
    );
    for (let index = 0; index < ids.length; index += 1) {
      if (ids[index] && Number(quantities[index]) > 0) {
        await client.query(
          'INSERT INTO batch_inputs(batch_id,source_type,source_id,product_id,qty) VALUES($1,$2,$3,$4,$5)',
          [batchResult.rows[0].id, types[index], ids[index], productIds[index], Number(quantities[index])]
        );
      }
    }
    await client.query('COMMIT');
    await audit(req.session.user.id, clientId, 'CREATE', 'batch', batchResult.rows[0].id, {
      internal_lot: internalLot,
      final_lot: finalLot
    });
    flash(req, 'ok', 'Elaboración registrada. Lote interno ' + internalLot + ' · lote final ' + finalLot);
  } catch (error) {
    await client.query('ROLLBACK');
    flash(req, 'error', error.code === '23505' ? 'El lote final ya existe dentro de esta empresa.' : (error.message || 'No se pudo registrar la elaboración.'));
  } finally {
    client.release();
  }
  res.redirect('/production');
}));

app.get('/trace', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const products = (await pool.query(
    'SELECT id,name,category FROM products WHERE client_id=$1 AND active=TRUE ORDER BY name',
    [clientId]
  )).rows;
  let matches = [];
  let tree = null;
  const productId = req.query.product_id || '';
  const lot = String(req.query.lot || '').trim();
  const direction = req.query.direction || 'back';
  if (productId && lot) {
    matches = (await pool.query(
      "SELECT 'receipt' type,r.id,r.internal_lot lot,r.received_at::text date FROM receipts r WHERE r.client_id=$1 AND r.product_id=$2 AND r.internal_lot ILIKE $3 UNION ALL SELECT 'batch',b.id,COALESCE(NULLIF(b.final_lot,''),b.internal_lot),b.produced_at::text FROM batches b WHERE b.client_id=$1 AND b.product_id=$2 AND (b.internal_lot ILIKE $3 OR b.final_lot ILIKE $3) ORDER BY date DESC",
      [clientId, productId, '%' + lot + '%']
    )).rows;
  }
  if (req.query.type && req.query.id) {
    const type = ['receipt', 'batch'].includes(req.query.type) ? req.query.type : null;
    if (type) {
      tree = direction === 'forward'
        ? await forward(pool, clientId, type, req.query.id)
        : await backward(pool, clientId, type, req.query.id);
    }
  }
  res.render('trace', { products, matches, tree, productId, lot, direction });
}));

app.get('/stock', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const rows = (await pool.query(
    "SELECT 'Ingreso' kind,r.id,p.name product,p.category,r.internal_lot lot,NULL::text final_lot,r.received_at::text date,r.expires_at::text expires,s.name origin,r.qty original_qty,COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='receipt' AND bi.source_id=r.id AND consumer.client_id=$1),0) consumed,r.qty-COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='receipt' AND bi.source_id=r.id AND consumer.client_id=$1),0) available,'LIBERADO' status,p.unit FROM receipts r JOIN products p ON p.id=r.product_id AND p.client_id=r.client_id JOIN suppliers s ON s.id=r.supplier_id AND s.client_id=r.client_id WHERE r.client_id=$1 UNION ALL SELECT 'Elaborado',b.id,p.name,p.category,b.internal_lot,b.final_lot,b.produced_at::date::text,NULL,s.name,b.qty,COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='batch' AND bi.source_id=b.id AND consumer.client_id=$1),0),b.qty-COALESCE((SELECT SUM(bi.qty) FROM batch_inputs bi JOIN batches consumer ON consumer.id=bi.batch_id WHERE bi.source_type='batch' AND bi.source_id=b.id AND consumer.client_id=$1),0),b.status,p.unit FROM batches b JOIN products p ON p.id=b.product_id AND p.client_id=b.client_id JOIN sectors s ON s.id=b.sector_id AND s.client_id=b.client_id WHERE b.client_id=$1 ORDER BY date DESC,lot",
    [clientId]
  )).rows;
  res.render('stock', { rows });
}));

app.post('/admin/batches/:id/status', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const allowed = ['LIBERADO', 'BLOQUEADO', 'RECHAZADO'];
  if (!allowed.includes(req.body.status)) return res.status(400).send('Estado inválido');
  const result = await pool.query(
    'UPDATE batches SET status=$1 WHERE id=$2 AND client_id=$3 RETURNING id',
    [req.body.status, req.params.id, clientId]
  );
  if (result.rows[0]) {
    await audit(req.session.user.id, clientId, 'STATUS_CHANGE', 'batch', req.params.id, { status: req.body.status });
    flash(req, 'ok', 'Estado del lote actualizado.');
  }
  res.redirect('/stock');
}));

app.get('/reports', requireAuth, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const rows = (await pool.query(
    'SELECT b.*,p.name product,s.name sector,r.name recipe,r.version,u.username FROM batches b JOIN products p ON p.id=b.product_id AND p.client_id=b.client_id JOIN sectors s ON s.id=b.sector_id AND s.client_id=b.client_id JOIN recipes r ON r.id=b.recipe_id AND r.client_id=b.client_id JOIN users u ON u.id=b.created_by WHERE b.client_id=$1 ORDER BY b.produced_at DESC LIMIT 1000',
    [clientId]
  )).rows;
  res.render('reports', { rows });
}));

app.get('/audit', requireAdmin, requireClient, asyncRoute(async (req, res) => {
  const clientId = currentClientId(req);
  const rows = (await pool.query(
    'SELECT a.*,u.username FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.client_id=$1 ORDER BY a.created_at DESC LIMIT 1000',
    [clientId]
  )).rows;
  res.render('audit', { rows });
}));

app.use((req, res) => res.status(404).render('error', { message: 'Página no encontrada.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Ocurrió un error interno. Revisá el registro del servidor.' });
});

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeDatabase(attempts = 12) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await initDb();
      await seedAdmin();
      return;
    } catch (error) {
      lastError = error;
      console.error('PostgreSQL todavía no está disponible (intento ' + attempt + '/' + attempts + '): ' + error.message);
      if (attempt < attempts) await wait(Math.min(2000 * attempt, 10000));
    }
  }
  throw lastError;
}

(async () => {
  if (!hasDatabaseConfig()) {
    throw new Error('Falta la conexión PostgreSQL. En Railway, agregá DATABASE_URL al servicio TRAZA5 con la referencia a Postgres.');
  }
  console.log('Conexión PostgreSQL detectada mediante ' + databaseConfigSource + '.');
  await initializeDatabase();
  const server = app.listen(PORT, HOST, () => {
    console.log('TRAZA5 activo en http://' + HOST + ':' + PORT);
  });
  const shutdown = signal => {
    console.log(signal + ': cerrando TRAZA5.');
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
