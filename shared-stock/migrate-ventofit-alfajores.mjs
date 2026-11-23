export function configureAlfajores(s){
 const changes=[];
 for(const item of s.items.filter(i=>!i.archived&&i.name.startsWith('ALFAJOR '))){
  const r=s.recipes.find(r=>r.itemId===item.id&&!r.disabled);
  if(!r||r.ventofitAlfajor105g)continue;
  const parts=r.components.map(c=>({c,i:s.items.find(i=>i.id===c.itemId)}));
  const tapas=parts.filter(p=>/^TAPAS (BLANCAS|NEGRAS)/.test(p.i?.name||''));
  const baths=parts.filter(p=>/^Baño de repostería/.test(p.i?.name||''));
  const fillings=parts.filter(p=>!tapas.includes(p)&&!baths.includes(p));
  if(tapas.length!==1||baths.length!==1||fillings.length!==1||parts.length!==3)throw Error('Revisar componentes de '+item.name);
  if(parts.some(p=>p.i.unit!=='kg'))throw Error('Unidad incompatible en '+item.name);
  r.components=[{...tapas[0].c,qty:.06},{...fillings[0].c,qty:.035},{...baths[0].c,qty:.01}];
  r.yield=1;r.version=Number(r.version||0)+1;r.ventofitAlfajor105g=true;
  changes.push(item.name);
 }
 return changes;
}
export function migrateAlfajores(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state),changes=configureAlfajores(s);
  if(changes.length){db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);console.log('VENTOFIT_ALFAJORES_105G',JSON.stringify(changes));}
 }
}
