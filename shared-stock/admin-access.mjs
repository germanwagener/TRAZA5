import {randomUUID,createHash} from 'node:crypto';
export const pendingPassword = '!private-setup-required';
export function provisionJuni(db) {
 db.exec('BEGIN IMMEDIATE');
 try {
  const businessBefore=JSON.stringify(db.prepare('SELECT * FROM companies ORDER BY id').all());
  let account=db.prepare('SELECT * FROM users WHERE username=?').get('juni');
  if(account&&(account.role!=='admin'||account.company_id!==null))throw Error('Existe Juni con permisos incompatibles; se requiere revisión.');
  if(!account){
   const principal=db.prepare("SELECT id FROM users WHERE role='admin' AND blocked=0 ORDER BY id LIMIT 1").get();
   if(!principal)throw Error('Falta administrador principal.');
   const uid=randomUUID();
   db.prepare('INSERT INTO users(id,username,password,role,company_id,blocked,must_change) VALUES(?,?,?,?,NULL,1,0)').run(uid,'juni',pendingPassword,'admin');
   db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),principal.id,null,'admin_account_prepared',JSON.stringify({userId:uid,username:'juni',role:'admin',blocked:true,requiresPrivateSetup:true}));
   account=db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  }
  if(JSON.stringify(db.prepare('SELECT * FROM companies ORDER BY id').all())!==businessBefore)throw Error('Los datos empresariales cambiaron.');
  const report={username:account.username,role:account.role,companyId:account.company_id,blocked:!!account.blocked,requiresPrivateSetup:account.password===pendingPassword,businessDataUnchanged:true,businessHash:createHash('sha256').update(businessBefore).digest('hex')};
  db.exec('COMMIT');return report;
 }catch(e){db.exec('ROLLBACK');throw e;}
}

export function manageAccount(db,actor,p,encode,log) {
 if(actor.role!=='admin')throw Error('Solo un administrador puede gestionar accesos.');
 const target=db.prepare('SELECT * FROM users WHERE id=?').get(p.userId);
 if(!target)throw Error('Usuario inexistente.');
 if(target.role==='admin'&&target.id===actor.id)throw Error('Usá otra cuenta administrativa para gestionar este acceso.');
 if(p.op==='reset'){
  if(target.role==='admin'&&(typeof p.password!=='string'||p.password.length<12))throw Error('El acceso administrativo requiere al menos 12 caracteres.');
  if(p.activate&&target.role!=='admin')throw Error('Activación inválida.');
  const encoded=encode(p.password);
  db.prepare('UPDATE users SET password=?,must_change=?,blocked=? WHERE id=?').run(encoded,p.activate?0:1,p.activate?0:target.blocked,target.id);
 }else if(p.op==='block'){
  if(typeof p.blocked!=='boolean')throw Error('Estado inválido.');
  if(!p.blocked&&target.password===pendingPassword)throw Error('Primero definí la contraseña privada con Activar.');
  if(p.blocked&&target.role==='admin'&&!db.prepare("SELECT id FROM users WHERE role='admin' AND blocked=0 AND must_change=0 AND id<>? LIMIT 1").get(target.id))throw Error('Debe quedar un administrador activo.');
  db.prepare('UPDATE users SET blocked=? WHERE id=?').run(p.blocked?1:0,target.id);
 }else throw Error('Operación inválida.');
 db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
 log(actor,p.activate?'admin_account_activated':p.op,{userId:target.id,username:target.username,role:target.role,blocked:p.op==='block'?p.blocked:undefined});
 return{ok:true};
}
