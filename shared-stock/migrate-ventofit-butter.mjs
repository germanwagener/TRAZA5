export function configureButter(s){
 const matches=s.items.filter(i=>String(i.name).toLocaleLowerCase('es').trim()==='manteca'&&!i.archived);
 if(matches.length!==1)throw Error('Se esperaba una sola materia prima Manteca');
 const item=matches[0];if(item.ventofitButter5kg)return null;
 if(!['u','kg'].includes(item.unit))throw Error('Unidad inesperada de manteca');
 const before=s.lots.filter(l=>String(l.itemId)===String(item.id)).map(l=>({id:l.id,qty:l.qty,remaining:l.remaining,unitCost:l.unitCost}));
 if(item.unit==='u')for(const l of s.lots.filter(l=>String(l.itemId)===String(item.id))){
  l.qty=Number(l.qty)*5;l.remaining=Number(l.remaining)*5;l.unitCost=Number(l.unitCost||0)/5;
 }
 // Formula quantities already represent kilograms, not whole pilones.
 Object.assign(item,{unit:'kg',presentationName:'Pilón',presentationContent:5,presentationContentUnit:'kg',ventofitButter5kg:true});
 return {itemId:item.id,previousLots:before,stockKg:s.lots.filter(l=>String(l.itemId)===String(item.id)).reduce((n,l)=>n+Number(l.remaining),0)};
}
export function migrateButter(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state),result=configureButter(s);if(!result)continue;
  db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),new Date().toISOString(),'system',c.id,'butter_stock_kg',JSON.stringify(result));
  console.log('VENTOFIT_BUTTER_KG',JSON.stringify(result));
 }
}
