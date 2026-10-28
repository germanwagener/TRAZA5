import {correct,remove} from './admin-corrections.mjs';
import {manageAccount} from './admin-access.mjs';
import {sessionPolicy} from './session-policy.mjs';
import {parseList,preview,applyList} from './import-lists.mjs';
import {importTraza5} from './import-traza5.mjs';
import {createBackupStore} from './backups.mjs';
import {driveBackups} from './drive-backups.mjs';
import {suggestLots,forecast} from './planning.mjs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {empty,operate,report,trace,id,avgCost,recipeCost,adjustStock} from './domain.mjs';
import {splitRequirements} from './production-split.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const dbPath=process.env.DB_PATH||join(root,'data','gestion.sqlite');mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS deleted_companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,payload TEXT NOT NULL,deleted_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','company')),company_id TEXT REFERENCES companies(id),blocked INTEGER NOT NULL DEFAULT 0,must_change INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,user_id TEXT NOT NULL,company_id TEXT,operation TEXT NOT NULL,detail TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,until INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
 CREATE INDEX IF NOT EXISTS audit_company ON audit(company_id,at);`);
const hashToken=x=>createHash('sha256').update(x).digest('hex');
function password(p){if(typeof p!=='string'||p.length<4||p.length>128)throw Error('La contraseña debe tener entre 4 y 128 caracteres.');const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex')}
function check(p,encoded){if(typeof p!=='string'||p.length>128||! /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded||''))return false;const [salt,h]=encoded.split(':');return timingSafeEqual(scryptSync(p,salt,64),Buffer.from(h,'hex'))}
function log(u,operation,detail){db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(id(),new Date().toISOString(),u.id,u.company_id||null,operation,JSON.stringify(detail,(key,value)=>key==='data'&&typeof value==='string'&&value.startsWith('data:application/pdf;')?'[PDF adjunto]':value))}
function tx(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}
function publicUser(u){return{id:u.id,username:u.username,role:u.role,companyId:u.company_id,blocked:!!u.blocked,mustChange:!!u.must_change}}
if(process.argv.includes('--has-admin')){console.log(db.prepare("SELECT id FROM users WHERE role='admin'").get()?'yes':'no');process.exit(0)}
if(process.argv.includes('--create-admin')){
 const username=process.env.ADMIN_USER||'administrador';const pass=process.env.ADMIN_PASSWORD;
 if(!pass){console.error('Definí ADMIN_PASSWORD (4 caracteres como mínimo).');process.exit(1)}
 if(db.prepare("SELECT id FROM users WHERE role='admin'").get()){console.error('Ya existe un administrador.');process.exit(1)}
 db.prepare('INSERT INTO users(id,username,password,role,must_change) VALUES(?,?,?,?,0)').run(id(),username,password(pass),'admin');console.log('Administrador creado.');process.exit(0)
}
const PORT=Number(process.env.PORT||3000),HOST=process.env.HOST||'127.0.0.1';let PUBLIC=process.env.PUBLIC_ORIGIN||`http://localhost:${PORT}`;
if(!PUBLIC.startsWith('https://')&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(PUBLIC)){throw Error('PUBLIC_ORIGIN debe usar HTTPS fuera de la computadora local.')}
const secure=PUBLIC.startsWith('https://');const cookie=(t,age)=>`gestion_session=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
const backups=createBackupStore(db,join(dirname(dbPath),'backups'));
const drive=driveBackups({directory:join(dirname(dbPath),'backups'),store:backups,origin:PUBLIC});
const backupTimer=setInterval(()=>{void drive.sync()},15*60*1000);backupTimer.unref();
void drive.sync();
function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data))}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>8e6)throw Error('Solicitud demasiado grande.')}return JSON.parse(data||'{}')}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,PUBLIC),path=url.pathname;
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Método no permitido.'});
 if(req.method==='POST'&&req.headers.origin!==PUBLIC)return send(res,403,{error:'Origen no autorizado.'});
 if(path==='/health'&&req.method==='GET'){db.prepare('SELECT 1').get();return send(res,200,{ok:true});}
 if(path==='/api/admin/drive/callback'&&req.method==='GET'){
  try{await drive.finish(url.searchParams,uid=>!!db.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND blocked=0 AND must_change=0").get(uid));void drive.sync();res.writeHead(303,{Location:'/', 'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});return res.end()}
  catch(e){return send(res,400,{error:e.message})}
 }
 if(!path.startsWith('/api/')){
  if(req.method!=='GET')return send(res,405,{error:'Método no permitido.'});
  const files={'/pdfjs/pdf.mjs':'../node_modules/pdfjs-dist/legacy/build/pdf.mjs','/pdfjs/pdf.worker.mjs':'../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs','/import-ui.js':'import-ui.js','/':'index.html','/privacidad':'privacy.html','/condiciones':'terms.html','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/pdf-lib.min.js':'pdf-lib.min.js','/table-layout.js':'table-layout.js','/table-layout.css':'table-layout.css','/app.js':'app.js','/styles.css':'styles.css','/assets/logo.png':'assets/logo.png','/assets/app-icon-180.png':'assets/app-icon-180.png','/assets/app-icon-192.png':'assets/app-icon-192.png','/assets/app-icon-512.png':'assets/app-icon-512.png','/assets/traza-icon.svg':'assets/traza-icon.svg'};if(!files[path])return send(res,404,{error:'No encontrado.'});const f=join(root,'public',files[path]);const mime=f.endsWith('.webmanifest')?'application/manifest+json':(f.endsWith('.js')||f.endsWith('.mjs'))?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':f.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return res.end(readFileSync(f));
 }
 if(path==='/api/login'&&req.method==='POST'){
  const p=await body(req),username=String(p.username||'').trim().toLowerCase();const key=hashToken(username),attempt=db.prepare('SELECT * FROM attempts WHERE key=?').get(key),now=Date.now();if(attempt&&attempt.until>now&&attempt.count>=8)return send(res,429,{error:'Demasiados intentos. Esperá 15 minutos.'});
  const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);const dummy='f'.repeat(32)+':'+ '0'.repeat(128);const valid=check(p.password,u?.password||dummy);if(!u||!valid||u.blocked){const count=attempt&&attempt.until>now?attempt.count+1:1;db.prepare('INSERT OR REPLACE INTO attempts VALUES(?,?,?)').run(key,count,now+15*60*1000);return send(res,401,{error:'Usuario o contraseña incorrectos, o cuenta bloqueada.'})}
  db.prepare('DELETE FROM attempts WHERE key=?').run(key);db.prepare('DELETE FROM sessions WHERE expires<?').run(now);const {remembered,age,expires}=sessionPolicy(u,p.remember,now);const t=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hashToken(t),u.id,expires);log(u,'login',{remembered});return send(res,200,{user:publicUser(u)},{'Set-Cookie':cookie(t,age)})
 }
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('gestion_session='))?.slice(16)||'';
 const u=db.prepare('SELECT u.*,s.expires session_expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.blocked=0').get(hashToken(token),Date.now());if(!u)return send(res,401,{error:'Iniciá sesión.'});if(u.username==='juni'&&u.session_expires===Number.MAX_SAFE_INTEGER)res.setHeader('Set-Cookie',cookie(token,2147483647));
 if(u.username==='juni'){const selected=url.searchParams.get('companyId'),target=selected?db.prepare('SELECT id FROM companies WHERE id=?').get(selected):null;log({...u,company_id:target?.id||null},'admin_request',{method:req.method,path});}
 if(path==='/api/me')return send(res,200,{user:publicUser(u)});
 if(path==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(hashToken(token));return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)})}
 if(path==='/api/password'&&req.method==='POST'){
  const p=await body(req);if(u.role==='admin'&&(typeof p.newPassword!=='string'||p.newPassword.length<12))throw Error('La contraseña administrativa requiere al menos 12 caracteres.');if(!check(p.oldPassword,u.password))return send(res,400,{error:'La contraseña actual no coincide.'});const encoded=password(p.newPassword);tx(()=>{db.prepare('UPDATE users SET password=?,must_change=0 WHERE id=?').run(encoded,u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);log(u,'password_changed',{})});return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)})
 }
 if(u.must_change)return send(res,403,{error:'Primero cambiá tu contraseña inicial.'});
 if(path==='/api/admin/drive'&&u.role==='admin'&&req.method==='POST'){
  const p=await body(req);if(p.op==='connect')return send(res,200,{url:drive.start(u.id)});
  if(p.op==='sync'){await drive.sync();return send(res,200,drive.status())}
  if(p.op==='recovery'){
   if(!check(p.password,u.password))throw Error('La contraseña del administrador no coincide.');
   return send(res,200,{key:readFileSync(join(dirname(dbPath),'backups','recovery.key')).toString('base64')});
  }
  throw Error('Operación inválida.');
 }
 if(path==='/api/admin/backups'){
  if(u.role!=='admin')return send(res,403,{error:'Solo el administrador puede gestionar respaldos.'});
  if(req.method==='GET'){let list=backups.list(),listingError=null;try{list=await drive.list()}catch(e){listingError=e.message}return send(res,200,{backups:list,drive:drive.status(),listingError});}
  const p=await body(req);
  if(p.op==='create'){const created=backups.create();void drive.sync();return send(res,200,created)}
  if(p.op==='preview'){await drive.ensure(p.name);return send(res,200,backups.preview(p.name))}
  if(p.op==='restore'){
   if(p.confirmation!==`RESTAURAR ${p.name}`)throw Error('Confirmá el respaldo que querés restaurar.');
   await drive.ensure(p.name);
   const result=backups.restore(p.name,u.id);return send(res,200,{ok:true,...result},{'Set-Cookie':cookie('',0)});
  }
  throw Error('Operación inválida.');
 }
 if(path==='/api/admin/audit'&&u.role==='admin'&&req.method==='GET')return send(res,200,{rows:db.prepare('SELECT a.at,a.operation,u.username,c.name company FROM audit a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN companies c ON c.id=a.company_id ORDER BY a.at DESC LIMIT 500').all()});
 if(path==='/api/admin'&&u.role==='admin'){
  if(req.method==='GET')return send(res,200,{deletedCompanies:db.prepare('SELECT id,name,deleted_at FROM deleted_companies ORDER BY deleted_at DESC').all(),companies:db.prepare('SELECT id,name FROM companies').all(),users:db.prepare('SELECT * FROM users').all().map(publicUser)});
  const p=await body(req);const result=tx(()=>{
   if(p.op==='create'){
    const username=String(p.username||'').trim().toLowerCase();if(!/^[a-z0-9_.-]{3,60}$/.test(username))throw Error('Usuario: 3 a 60 letras sin acentos, números, puntos o guiones.');const encoded=password(p.password);let cid=p.companyId;const imported=p.trazaData?importTraza5(p.trazaData,p.trazaClientId):null;if(imported&&cid)throw Error('La importación crea una empresa nueva.');
    if(!cid){const name=String(imported?.company||p.companyName||'').trim();if(!name)throw Error('Ingresá la empresa.');cid=id();db.prepare('INSERT INTO companies(id,name,state) VALUES(?,?,?)').run(cid,name,JSON.stringify(imported||empty(name)))}else if(!db.prepare('SELECT id FROM companies WHERE id=?').get(cid))throw Error('Empresa inexistente.');
    const userId=id();db.prepare('INSERT INTO users(id,username,password,role,company_id) VALUES(?,?,?,?,?)').run(userId,username,encoded,'company',cid);log(u,'user_created',{userId,companyId:cid});return{ok:true}
   }
   if(p.op==='deleteCompany'){
    const target=db.prepare("SELECT * FROM users WHERE id=? AND role='company'").get(p.userId);if(!target)throw Error('Usuario de empresa no encontrado.');
    const company=db.prepare('SELECT * FROM companies WHERE id=?').get(target.company_id);if(p.confirmation!==company.name)throw Error('Escribí el nombre de la empresa para confirmar.');
    const users=db.prepare('SELECT * FROM users WHERE company_id=?').all(company.id),audit=db.prepare('SELECT * FROM audit WHERE company_id=?').all(company.id);
    db.prepare('INSERT INTO deleted_companies VALUES(?,?,?,?)').run(company.id,company.name,JSON.stringify({company,users,audit}),new Date().toISOString());
    for(const x of users)db.prepare('DELETE FROM sessions WHERE user_id=?').run(x.id);
    db.prepare('DELETE FROM users WHERE company_id=?').run(company.id);db.prepare('DELETE FROM companies WHERE id=?').run(company.id);log(u,'company_deleted',{companyId:company.id,name:company.name,recoverable:true});return{ok:true};
   }
   if(p.op==='restoreCompany'){
    const deleted=db.prepare('SELECT * FROM deleted_companies WHERE id=?').get(p.companyId);if(!deleted)throw Error('Empresa eliminada inexistente.');const {company,users}=JSON.parse(deleted.payload);
    if(users.some(x=>db.prepare('SELECT id FROM users WHERE username=?').get(x.username)))throw Error('Uno de los usuarios ya existe. Resolvé ese nombre antes de recuperar la empresa.');
    db.prepare('INSERT INTO companies VALUES(?,?,?,?)').run(company.id,company.name,company.state,company.version+1);
    for(const x of users)db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(x.id,x.username,x.password,x.role,x.company_id,x.blocked,x.must_change);
    db.prepare('DELETE FROM deleted_companies WHERE id=?').run(company.id);log(u,'company_restored',{companyId:company.id,name:company.name});return{ok:true};
   }
   return manageAccount(db,u,p,password,log);
  });return send(res,200,result)
 }
 if(path==='/api/admin/stock'&&u.role==='admin'){
  const companyId=url.searchParams.get('companyId');const c=db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);if(!c)throw Error('Empresa inexistente.');
  if(req.method==='GET'){const s=JSON.parse(c.state);return send(res,200,{company:{id:c.id,name:c.name},lots:s.lots.map(l=>({id:l.id,code:l.code,itemId:l.itemId,itemName:s.items.find(i=>i.id===l.itemId)?.name||'Artículo eliminado',unit:s.items.find(i=>i.id===l.itemId)?.unit||'',remaining:l.remaining,status:l.status,expiry:l.expiry||'',date:l.date}))});}
  const p=await body(req);const result=tx(()=>{const current=db.prepare('SELECT * FROM companies WHERE id=?').get(companyId),s=JSON.parse(current.state),adjustment=adjustStock(s,p);db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),companyId);log(u,'stock_adjusted',{companyId,...adjustment});return adjustment});return send(res,200,{result});
 }
 const adminCompanyId=u.role==='admin'?url.searchParams.get('companyId'):null;
 if(path==='/api/admin/correct'){
  if(u.role!=='admin')return send(res,403,{error:'Solo el administrador puede corregir datos.'});
  if(req.method!=='POST')return send(res,405,{error:'Método no permitido.'});
  const p=await body(req);const result=tx(()=>{const c=db.prepare('SELECT * FROM companies WHERE id=?').get(adminCompanyId);if(!c)throw Error('Empresa inexistente.');if(p.version!==c.version){const e=Error('Los datos cambiaron. Actualizá la empresa y revisá la corrección.');e.status=409;throw e;}const state=JSON.parse(c.state),change=correct(state,p);db.prepare('UPDATE companies SET name=?,state=?,version=version+1 WHERE id=?').run(state.company,JSON.stringify(state),c.id);log({...u,company_id:c.id},'admin_correction',{...change,reason:String(p.reason||'Corrección administrativa')});return{version:c.version+1};});return send(res,200,result);
 }
 if(path==='/api/admin/remove'){
  if(u.role!=='admin')return send(res,403,{error:'Solo el administrador puede eliminar datos.'});if(req.method!=='POST')return send(res,405,{error:'Método no permitido.'});
  const p=await body(req);const result=tx(()=>{const c=db.prepare('SELECT * FROM companies WHERE id=?').get(adminCompanyId);if(!c)throw Error('Empresa inexistente.');if(p.version!==c.version){const e=Error('Los datos cambiaron. Actualizá la empresa y revisá la eliminación.');e.status=409;throw e}const state=JSON.parse(c.state),change=remove(state,p);db.prepare('UPDATE companies SET name=?,state=?,version=version+1 WHERE id=?').run(state.company,JSON.stringify(state),c.id);log({...u,company_id:c.id},'admin_deletion',{...change,reason:String(p.reason||'Eliminación administrativa')});return{version:c.version+1}});return send(res,200,result);
 }
 if(u.role!=='company'&&!adminCompanyId)return send(res,403,{error:'Elegí Editar en una empresa para consultar sus datos.'});
 const selectedCompanyId=u.role==='admin'?adminCompanyId:u.company_id;
 const company=()=>{const c=db.prepare('SELECT * FROM companies WHERE id=?').get(selectedCompanyId);if(!c)throw Error('Empresa inexistente.');return c};

 if(path==='/api/document'&&req.method==='GET'){
  const s=JSON.parse(company().state),collection=url.searchParams.get('collection');
  if(!['items','suppliers'].includes(collection))throw Error('Documento inexistente.');
  const row=s[collection].find(x=>x.id===url.searchParams.get('record')),doc=row?.documents?.find(x=>x.id===url.searchParams.get('id'));
  if(!doc)return send(res,404,{error:'Documento inexistente.'});
  res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':(url.searchParams.has('download')?"attachment":"inline")+"; filename*=UTF-8''"+encodeURIComponent(doc.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(Buffer.from(doc.data.split(',')[1],'base64'));
 }
 if(path==='/api/import/preview'&&req.method==='POST'){
  if(u.role!=='admin'||u.username!=='juni')return send(res,403,{error:'Usá la cuenta Juni para importar.'});
  const p=await body(req),c=company();if(p.companyId!==c.id)throw Error('Empresa destino incorrecta.');
  const input=p.rows??parseList(p.text,p.format);
  return send(res,200,{companyId:c.id,companyName:c.name,version:c.version,rows:preview(JSON.parse(c.state),p.type,input)});
 }
 if(path==='/api/import/apply'&&req.method==='POST')return send(res,200,applyList(db,u,selectedCompanyId,await body(req)));
 if(path==='/api/state'&&req.method==='GET'){const c=company(),s=JSON.parse(c.state);return send(res,200,{state:JSON.parse(JSON.stringify(s,(key,value)=>key==='data'&&typeof value==='string'&&value.startsWith('data:application/pdf;')?undefined:value)),version:c.version,estimates:Object.fromEntries(s.items.map(i=>[i.id,{average:avgCost(s,i.id),recipe:recipeCost(s,i.id)}]))})}
 if(path==='/api/planning'&&req.method==='GET')return send(res,200,{rows:forecast(JSON.parse(company().state),url.searchParams.get('date'))});
 if(path==='/api/suggest'&&req.method==='GET'){
  const s=JSON.parse(company().state),date=url.searchParams.get('date'),rid=url.searchParams.get('recipe');let requirements;
  if(rid){const r=s.recipes.find(x=>x.id===rid);if(!r)throw Error('Elegí una receta.');const batches=Number(url.searchParams.get('batches'));if(!Number.isFinite(batches)||batches<=0)throw Error('Indicá la cantidad de recetas a elaborar antes de sugerir lotes.');requirements=splitRequirements(r,batches,url.searchParams.get('primaryQty'),url.searchParams.get('secondaryQty')).map(x=>({itemId:x.itemId,qty:x.required}));}
  else {const itemId=url.searchParams.get('item'),qty=Number(url.searchParams.get('qty'));if(!itemId)throw Error('Elegí un producto antes de sugerir lotes.');if(!Number.isFinite(qty)||qty<=0)throw Error('Indicá la cantidad a vender antes de sugerir lotes.');requirements=[{itemId,qty}];}
  return send(res,200,suggestLots(s,requirements,date));
 }
 if(path==='/api/report'&&req.method==='GET')return send(res,200,report(JSON.parse(company().state),url.searchParams.get('month')));
 if(path==='/api/trace'&&req.method==='GET')return send(res,200,trace(JSON.parse(company().state),url.searchParams.get('lot')));
 if(path==='/api/audit'&&req.method==='GET')return send(res,200,{rows:db.prepare('SELECT a.at,a.operation,a.detail,u.username FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.company_id=? ORDER BY a.at DESC LIMIT 500').all(selectedCompanyId)});
 if(path==='/api/backup'&&req.method==='GET'){const c=company();return send(res,200,{format:'gestion-integral-v2',company:c.name,version:c.version,state:JSON.parse(c.state)})}
 if(path==='/api/action'&&req.method==='POST'){
  const p=await body(req);const result=tx(()=>{const c=company();if(p.version!==c.version){const e=Error('Otro usuario modificó la empresa. Actualizá la pantalla y revisá los datos antes de guardar.');e.status=409;throw e}const s=JSON.parse(c.state),result=operate(s,p.op,p.data||{});if(['master','recipe'].includes(p.op)){const attachments=p.data?.attachments||[];if(!Array.isArray(attachments)||attachments.length>3)throw Error('Documentos inválidos.');for(const doc of attachments)operate(s,'document',{...doc,collection:p.op==='recipe'?'items':p.data.collection,recordId:p.op==='recipe'?result.itemId:result.id});}db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);log({...u,company_id:c.id},u.role==='admin'?'admin_'+p.op:p.op,result);return{result,version:c.version+1}});return send(res,200,result)
 }
 return send(res,404,{error:'Ruta no disponible.'});
}catch(e){const msg=e.message.includes('UNIQUE constraint')?'Ese nombre de usuario ya existe.':e.message;send(res,e.status||400,{error:msg})}});
server.listen(PORT,HOST,()=>{
 if(PORT===0)PUBLIC=`http://localhost:${server.address().port}`;
 console.log(`Gestión Integral disponible en ${PUBLIC}`);
 if(process.send)process.send({type:'ready',url:PUBLIC});
});
if(process.send){
 let closing=false;
 const close=()=>{if(closing)return;closing=true;server.close(()=>{db.close();process.exit(0)});server.closeIdleConnections();};
 process.on('message',m=>{if(m?.type==='shutdown')close()});
 process.on('disconnect',close);
}
