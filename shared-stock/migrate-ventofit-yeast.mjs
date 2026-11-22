export function configureYeast(s){
 const matches=s.items.filter(i=>String(i.name).toLocaleLowerCase('es').trim()==='levadura seca'&&!i.archived);
 if(matches.length!==1)throw Error('Se esperaba una sola materia prima Levadura seca');
 const item=matches[0];if(item.ventofitYeast500g)return null;
 if(!['u','kg'].includes(item.unit))throw Error('Unidad inesperada de levadura seca');
 const before=s.lots.filter(l=>String(l.itemId)===String(item.id)).map(l=>({id:l.id,qty:l.qty,remaining:l.remaining,unitCost:l.unitCost}));
 if(item.unit==='u')for(const l of s.lots.filter(l=>String(l.itemId)===String(item.id))){
  l.qty=Number(l.qty)*.5;l.remaining=Number(l.remaining)*.5;l.unitCost=Number(l.unitCost||0)/.5;
 }
 // Formula quantities already represent kilograms of ingredient.
 Object.assign(item,{unit:'kg',presentationName:'Paquete',presentationContent:.5,presentationContentUnit:'kg',ventofitYeast500g:true});
 return {itemId:item.id,previousLots:before,stockKg:s.lots.filter(l=>String(l.itemId)===String(item.id)).reduce((n,l)=>n+Number(l.remaining),0)};
}
export function migrateYeast(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state),result=configureYeast(s);if(!result)continue;
  db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),new Date().toISOString(),'system',c.id,'yeast_stock_kg',JSON.stringify(result));
  console.log('VENTOFIT_YEAST_KG',JSON.stringify(result));
 }
}
