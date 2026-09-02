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
app.get('/health', async (req,res)=>{
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
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*12 }
}));

function asyncRoute(fn){ return (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next); }
function requireAuth(req,res,next){ if(!req.session.user) return res.redirect('/login'); next(); }
function requireAdmin(req,res,next){ if(!req.session.user || req.session.user.role!=='admin') return res.status(403).render('error',{message:'Solo el administrador puede realizar esta acción.'}); next(); }
function flash(req,type,message){ req.session.flash={type,message}; }

app.use(asyncRoute(async (req,res,next)=>{
  res.locals.user=req.session.user||null;
  res.locals.flash=req.session.flash||null;
  delete req.session.flash;
  if(req.session.user){
    const {rows}=await pool.query('SELECT id,name FROM sectors WHERE active=TRUE ORDER BY position,name');
    res.locals.sectors=rows;
  } else res.locals.sectors=[];
  next();
}));

async function seedAdmin(){
  const username=process.env.ADMIN_USER||'admin';
  const password=process.env.ADMIN_INITIAL_PASSWORD||'admin123';
  const found=await pool.query('SELECT id FROM users WHERE username=$1',[username]);
  if(found.rowCount===0){
    const hash=await bcrypt.hash(password,12);
    await pool.query("INSERT INTO users(username,password_hash,role) VALUES($1,$2,'admin')",[username,hash]);
  }
}

app.get('/login',(req,res)=>res.render('login'));
app.post('/login',asyncRoute(async(req,res)=>{
  const {rows}=await pool.query('SELECT * FROM users WHERE username=$1 AND active=TRUE',[req.body.username.trim()]);
  const u=rows[0];
  if(!u || !(await bcrypt.compare(req.body.password,u.password_hash))){ flash(req,'error','Usuario o contraseña incorrectos.'); return res.redirect('/login'); }
  req.session.user={id:u.id,username:u.username,role:u.role};
  await audit(u.id,'LOGIN','user',u.id,{});
  res.redirect('/');
}));
app.post('/logout',requireAuth,(req,res)=>req.session.destroy(()=>res.redirect('/login')));

app.get('/',requireAuth,asyncRoute(async(req,res)=>{
  const [products,suppliers,recipes,receipts,batches,recent]=await Promise.all([
    pool.query('SELECT COUNT(*)::int n FROM products WHERE active=TRUE'),pool.query('SELECT COUNT(*)::int n FROM suppliers WHERE active=TRUE'),
    pool.query('SELECT COUNT(*)::int n FROM recipes WHERE active=TRUE'),pool.query('SELECT COUNT(*)::int n FROM receipts'),pool.query('SELECT COUNT(*)::int n FROM batches'),
    pool.query(`SELECT b.id,b.internal_lot,b.final_lot,b.qty,b.produced_at,b.status,p.name product,s.name sector FROM batches b JOIN products p ON p.id=b.product_id JOIN sectors s ON s.id=b.sector_id ORDER BY b.created_at DESC LIMIT 12`)
  ]);
  res.render('dashboard',{stats:{Productos:products.rows[0].n,Proveedores:suppliers.rows[0].n,Recetas:recipes.rows[0].n,Ingresos:receipts.rows[0].n,Elaboraciones:batches.rows[0].n},recent:recent.rows});
}));

app.get('/admin/users',requireAdmin,asyncRoute(async(req,res)=>{ const {rows}=await pool.query('SELECT id,username,role,active,created_at FROM users ORDER BY username'); res.render('users',{rows}); }));
app.post('/admin/users',requireAdmin,asyncRoute(async(req,res)=>{
  const hash=await bcrypt.hash(req.body.password,12);
  try{ const {rows}=await pool.query('INSERT INTO users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id',[req.body.username.trim(),hash,req.body.role]); await audit(req.session.user.id,'CREATE','user',rows[0].id,{username:req.body.username,role:req.body.role}); flash(req,'ok','Usuario creado.'); }
  catch(e){ flash(req,'error',e.code==='23505'?'Ese usuario ya existe.':'No se pudo crear el usuario.'); }
  res.redirect('/admin/users');
}));
app.post('/admin/users/:id/toggle',requireAdmin,asyncRoute(async(req,res)=>{ await pool.query('UPDATE users SET active=NOT active WHERE id=$1 AND id<>$2',[req.params.id,req.session.user.id]); await audit(req.session.user.id,'TOGGLE','user',req.params.id,{}); res.redirect('/admin/users'); }));

app.get('/account/password',requireAuth,(req,res)=>res.render('password'));
app.post('/account/password',requireAuth,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.session.user.id]);
  if(!rows[0] || !(await bcrypt.compare(req.body.current,rows[0].password_hash)) || req.body.password!==req.body.confirm){ flash(req,'error','Revisá la contraseña actual y que las nuevas coincidan.'); return res.redirect('/account/password'); }
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(req.body.password,12),req.session.user.id]); await audit(req.session.user.id,'PASSWORD_CHANGE','user',req.session.user.id,{}); flash(req,'ok','Contraseña actualizada.'); res.redirect('/');
}));

app.get('/admin/masters',requireAdmin,asyncRoute(async(req,res)=>{
  const [suppliers,products,sectors]=await Promise.all([pool.query('SELECT * FROM suppliers ORDER BY active DESC,name'),pool.query('SELECT * FROM products ORDER BY active DESC,name'),pool.query('SELECT * FROM sectors ORDER BY position,name')]);
  res.render('masters',{suppliers:suppliers.rows,products:products.rows,sectorRows:sectors.rows});
}));
app.post('/admin/suppliers',requireAdmin,asyncRoute(async(req,res)=>{ try{const {rows}=await pool.query('INSERT INTO suppliers(name,tax_id,contact) VALUES($1,$2,$3) RETURNING id',[req.body.name.trim(),req.body.tax_id||'',req.body.contact||'']); await audit(req.session.user.id,'CREATE','supplier',rows[0].id,{name:req.body.name}); flash(req,'ok','Proveedor agregado.');}catch(e){flash(req,'error','No se pudo agregar el proveedor. Puede que ya exista.');}res.redirect('/admin/masters'); }));
app.post('/admin/products',requireAdmin,asyncRoute(async(req,res)=>{ try{const {rows}=await pool.query(`INSERT INTO products(code,name,category,unit,default_brand,shelf_life_days) VALUES(NULLIF($1,''),$2,$3,$4,$5,$6) RETURNING id`,[req.body.code||'',req.body.name.trim(),req.body.category,req.body.unit,req.body.default_brand||'',Number(req.body.shelf_life_days||0)]);await audit(req.session.user.id,'CREATE','product',rows[0].id,{name:req.body.name});flash(req,'ok','Producto agregado.');}catch(e){flash(req,'error','No se pudo agregar el producto. Revisá el código.');}res.redirect('/admin/masters'); }));
app.post('/admin/sectors/:id',requireAdmin,asyncRoute(async(req,res)=>{ await pool.query('UPDATE sectors SET name=$1,position=$2 WHERE id=$3',[req.body.name.trim(),Number(req.body.position),req.params.id]); await audit(req.session.user.id,'UPDATE','sector',req.params.id,{name:req.body.name}); flash(req,'ok','Sector actualizado.'); res.redirect('/admin/masters'); }));

app.get('/admin/recipes',requireAdmin,asyncRoute(async(req,res)=>{
  const [products,recipes]=await Promise.all([pool.query('SELECT id,name,category,unit FROM products WHERE active=TRUE ORDER BY name'),pool.query(`SELECT r.*,s.name sector,p.name output_product FROM recipes r JOIN sectors s ON s.id=r.sector_id JOIN products p ON p.id=r.output_product_id ORDER BY s.position,r.name,r.version`)]);
  res.render('recipes',{products:products.rows,recipes:recipes.rows});
}));
app.post('/admin/recipes',requireAdmin,asyncRoute(async(req,res)=>{
  const client=await pool.connect();
  try{ await client.query('BEGIN'); const rr=await client.query(`INSERT INTO recipes(name,sector_id,output_product_id,output_qty,version,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[req.body.name.trim(),req.body.sector_id,req.body.output_product_id,Number(req.body.output_qty),req.body.version||'1.0',req.body.notes||'']); const rid=rr.rows[0].id; const pids=[].concat(req.body.input_product_id||[]); const qtys=[].concat(req.body.input_qty||[]); for(let i=0;i<pids.length;i++){ if(pids[i] && Number(qtys[i])>0) await client.query('INSERT INTO recipe_items(recipe_id,product_id,qty) VALUES($1,$2,$3)',[rid,pids[i],Number(qtys[i])]); } await client.query('COMMIT'); await audit(req.session.user.id,'CREATE','recipe',rid,{name:req.body.name,version:req.body.version}); flash(req,'ok','Receta creada.'); }
  catch(e){ await client.query('ROLLBACK'); flash(req,'error','No se pudo crear la receta. Revisá versión e ingredientes duplicados.'); }
  finally{client.release();} res.redirect('/admin/recipes');
}));

app.get('/receipts',requireAuth,asyncRoute(async(req,res)=>{
  const [suppliers,products,rows]=await Promise.all([pool.query('SELECT id,name FROM suppliers WHERE active=TRUE ORDER BY name'),pool.query('SELECT id,name,category,unit,default_brand,shelf_life_days FROM products WHERE active=TRUE ORDER BY name'),pool.query(`SELECT r.*,p.name product,s.name supplier,u.username FROM receipts r JOIN products p ON p.id=r.product_id JOIN suppliers s ON s.id=r.supplier_id JOIN users u ON u.id=r.created_by ORDER BY r.created_at DESC LIMIT 300`)]); res.render('receipts',{suppliers:suppliers.rows,products:products.rows,rows:rows.rows});
}));
app.post('/receipts',requireAuth,asyncRoute(async(req,res)=>{
  const p=(await pool.query('SELECT unit,shelf_life_days FROM products WHERE id=$1 AND active=TRUE',[req.body.product_id])).rows[0]; if(!p){flash(req,'error','Producto inválido.');return res.redirect('/receipts');}
  let expires=req.body.expires_at||null; if(!expires && Number(p.shelf_life_days)>0){const d=new Date(req.body.received_at+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(p.shelf_life_days));expires=d.toISOString().slice(0,10);} const lot='MP-'+Date.now().toString(36).toUpperCase();
  const {rows}=await pool.query(`INSERT INTO receipts(supplier_id,product_id,brand,supplier_lot,internal_lot,qty,unit,unit_price,received_at,expires_at,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[req.body.supplier_id,req.body.product_id,req.body.brand||'',req.body.supplier_lot||'',lot,Number(req.body.qty),p.unit,Number(req.body.unit_price||0),req.body.received_at,expires,req.body.notes||'',req.session.user.id]); await audit(req.session.user.id,'CREATE','receipt',rows[0].id,{internal_lot:lot,qty:req.body.qty}); flash(req,'ok',`Ingreso registrado. Lote interno: ${lot}`); res.redirect('/receipts');
}));

async function availableSource(client,type,id){
  if(type==='receipt'){
    const {rows}=await client.query(`SELECT r.product_id,r.qty-COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='receipt' AND source_id=r.id),0) available FROM receipts r WHERE r.id=$1 FOR UPDATE`,[id]);
    return rows[0]||null;
  }
  const {rows}=await client.query(`SELECT b.product_id,b.status,b.qty-COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='batch' AND source_id=b.id),0) available FROM batches b WHERE b.id=$1 FOR UPDATE`,[id]);
  return rows[0]||null;
}

app.get('/production',requireAuth,asyncRoute(async(req,res)=>{
  const recipes=(await pool.query(`SELECT r.id,r.name,r.version,r.sector_id,r.output_product_id,p.name output_product,s.name sector FROM recipes r JOIN products p ON p.id=r.output_product_id JOIN sectors s ON s.id=r.sector_id WHERE r.active=TRUE ORDER BY s.position,r.name`)).rows;
  res.render('production',{recipes});
}));
app.get('/api/recipe/:id',requireAuth,asyncRoute(async(req,res)=>{
  const recipe=(await pool.query(`SELECT r.*,p.name output_product,p.unit output_unit,s.name sector FROM recipes r JOIN products p ON p.id=r.output_product_id JOIN sectors s ON s.id=r.sector_id WHERE r.id=$1`,[req.params.id])).rows[0];
  const items=(await pool.query(`SELECT ri.product_id,ri.qty,p.name,p.unit,p.category FROM recipe_items ri JOIN products p ON p.id=ri.product_id WHERE ri.recipe_id=$1 ORDER BY p.name`,[req.params.id])).rows;
  res.json({recipe,items});
}));
app.get('/api/lots/:productId',requireAuth,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`
    SELECT 'receipt' source_type,r.id source_id,r.internal_lot lot,r.received_at::text date,r.expires_at::text expires,
      (r.qty-COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='receipt' AND source_id=r.id),0)) available,
      s.name origin
    FROM receipts r JOIN suppliers s ON s.id=r.supplier_id WHERE r.product_id=$1
    UNION ALL
    SELECT 'batch',b.id,b.internal_lot,b.produced_at::date::text,NULL,
      (b.qty-COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='batch' AND source_id=b.id),0)),sec.name
    FROM batches b JOIN sectors sec ON sec.id=b.sector_id WHERE b.product_id=$1 AND b.status='LIBERADO'
    ORDER BY date,lot`,[req.params.productId]); res.json(rows.filter(r=>Number(r.available)>0));
}));
app.post('/production',requireAuth,asyncRoute(async(req,res)=>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const recipe=(await client.query('SELECT * FROM recipes WHERE id=$1 AND active=TRUE',[req.body.recipe_id])).rows[0]; if(!recipe) throw new Error('Receta inválida');
    const types=[].concat(req.body.source_type||[]), ids=[].concat(req.body.source_id||[]), pids=[].concat(req.body.source_product_id||[]), qtys=[].concat(req.body.source_qty||[]);
    for(let i=0;i<ids.length;i++){
      const q=Number(qtys[i]); if(!ids[i]||q<=0) continue;
      const src=await availableSource(client,types[i],ids[i]);
      if(!src) throw new Error('Uno de los lotes seleccionados ya no existe.');
      const av=Number(src.available||0);
      if(Number(src.product_id)!==Number(pids[i])) throw new Error('El producto del lote no coincide con el componente de la receta.');
      if(q>av+1e-9) throw new Error(`Stock insuficiente para uno de los lotes. Disponible ${av}`);
      if(types[i]==='batch' && src.status!=='LIBERADO') throw new Error('Se intentó usar un lote no liberado.');
    }
    const ilot='INT-'+Date.now().toString(36).toUpperCase(); const flot=(req.body.final_lot||'').trim()||('LF-'+Date.now().toString(36).toUpperCase());
    const br=await client.query(`INSERT INTO batches(recipe_id,sector_id,product_id,internal_lot,final_lot,qty,produced_at,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'LIBERADO',$8,$9) RETURNING id`,[recipe.id,recipe.sector_id,recipe.output_product_id,ilot,flot,Number(req.body.output_qty),req.body.produced_at,req.body.notes||'',req.session.user.id]);
    for(let i=0;i<ids.length;i++){if(ids[i]&&Number(qtys[i])>0) await client.query('INSERT INTO batch_inputs(batch_id,source_type,source_id,product_id,qty) VALUES($1,$2,$3,$4,$5)',[br.rows[0].id,types[i],ids[i],pids[i],Number(qtys[i])]);}
    await client.query('COMMIT'); await audit(req.session.user.id,'CREATE','batch',br.rows[0].id,{internal_lot:ilot,final_lot:flot}); flash(req,'ok',`Elaboración registrada. Lote interno ${ilot} · lote final ${flot}`); res.redirect('/production');
  }catch(e){await client.query('ROLLBACK');flash(req,'error',e.message||'No se pudo registrar la elaboración.');res.redirect('/production');}finally{client.release();}
}));

app.get('/trace',requireAuth,asyncRoute(async(req,res)=>{
  const products=(await pool.query('SELECT id,name,category FROM products WHERE active=TRUE ORDER BY name')).rows; let matches=[],tree=null;
  const productId=req.query.product_id||''; const lot=(req.query.lot||'').trim(); const direction=req.query.direction||'back';
  if(productId && lot){ matches=(await pool.query(`SELECT 'receipt' type,r.id,r.internal_lot lot,r.received_at::text date FROM receipts r WHERE r.product_id=$1 AND r.internal_lot ILIKE $2 UNION ALL SELECT 'batch',b.id,COALESCE(NULLIF(b.final_lot,''),b.internal_lot),b.produced_at::text FROM batches b WHERE b.product_id=$1 AND (b.internal_lot ILIKE $2 OR b.final_lot ILIKE $2) ORDER BY date DESC`,[productId,`%${lot}%`])).rows; }
  if(req.query.type && req.query.id){ tree=direction==='forward' ? await forward(pool,req.query.type,req.query.id) : await backward(pool,req.query.type,req.query.id); }
  res.render('trace',{products,matches,tree,productId,lot,direction});
}));


app.get('/stock',requireAuth,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`
    SELECT 'Ingreso' kind,r.id,p.name product,p.category,r.internal_lot lot,NULL::text final_lot,
           r.received_at::text date,r.expires_at::text expires,s.name origin,r.qty original_qty,
           COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='receipt' AND source_id=r.id),0) consumed,
           r.qty-COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='receipt' AND source_id=r.id),0) available,
           'LIBERADO' status,p.unit
    FROM receipts r JOIN products p ON p.id=r.product_id JOIN suppliers s ON s.id=r.supplier_id
    UNION ALL
    SELECT 'Elaborado',b.id,p.name,p.category,b.internal_lot,b.final_lot,b.produced_at::date::text,NULL,s.name,b.qty,
           COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='batch' AND source_id=b.id),0),
           b.qty-COALESCE((SELECT SUM(qty) FROM batch_inputs WHERE source_type='batch' AND source_id=b.id),0),b.status,p.unit
    FROM batches b JOIN products p ON p.id=b.product_id JOIN sectors s ON s.id=b.sector_id
    ORDER BY date DESC,lot`);
  res.render('stock',{rows});
}));
app.post('/admin/batches/:id/status',requireAdmin,asyncRoute(async(req,res)=>{
  const allowed=['LIBERADO','BLOQUEADO','RECHAZADO'];
  if(!allowed.includes(req.body.status)) return res.status(400).send('Estado inválido');
  await pool.query('UPDATE batches SET status=$1 WHERE id=$2',[req.body.status,req.params.id]);
  await audit(req.session.user.id,'STATUS_CHANGE','batch',req.params.id,{status:req.body.status});
  flash(req,'ok','Estado del lote actualizado.');
  res.redirect(req.get('referer')||'/stock');
}));

app.get('/reports',requireAuth,asyncRoute(async(req,res)=>{
  const {rows}=await pool.query(`SELECT b.*,p.name product,s.name sector,r.name recipe,r.version,u.username FROM batches b JOIN products p ON p.id=b.product_id JOIN sectors s ON s.id=b.sector_id JOIN recipes r ON r.id=b.recipe_id JOIN users u ON u.id=b.created_by ORDER BY b.produced_at DESC LIMIT 1000`); res.render('reports',{rows});
}));
app.get('/audit',requireAdmin,asyncRoute(async(req,res)=>{const {rows}=await pool.query(`SELECT a.*,u.username FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 1000`);res.render('audit',{rows});}));

app.use((req,res)=>res.status(404).render('error',{message:'Página no encontrada.'}));
app.use((err,req,res,next)=>{console.error(err);res.status(500).render('error',{message:'Ocurrió un error interno. Revisá el registro del servidor.'});});

function wait(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }

async function initializeDatabase(attempts=12){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try {
      await initDb();
      await seedAdmin();
      return;
    } catch (error) {
      lastError=error;
      console.error(`PostgreSQL todavía no está disponible (intento ${attempt}/${attempts}): ${error.message}`);
      if(attempt<attempts) await wait(Math.min(2000*attempt,10000));
    }
  }
  throw lastError;
}

(async()=>{
  if(!hasDatabaseConfig()){
    throw new Error('Falta la conexión PostgreSQL. En Railway, agregá DATABASE_URL al servicio TRAZA5 con el valor de referencia ${{Postgres.DATABASE_URL}}.');
  }
  console.log(`Conexión PostgreSQL detectada mediante ${databaseConfigSource}.`);
  await initializeDatabase();
  const server=app.listen(PORT,HOST,()=>console.log(`TRAZA5 activo en http://${HOST}:${PORT}`));
  const shutdown=signal=>{
    console.log(`${signal}: cerrando TRAZA5.`);
    server.close(()=>pool.end().finally(()=>process.exit(0)));
  };
  process.on('SIGTERM',()=>shutdown('SIGTERM'));
  process.on('SIGINT',()=>shutdown('SIGINT'));
})().catch(e=>{console.error(e);process.exit(1)});
