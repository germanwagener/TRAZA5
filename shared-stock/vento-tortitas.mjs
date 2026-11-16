import {operate} from './domain.mjs';

const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const varieties=[
 {flavor:'vainilla',box:'TORTITAS DE VAINILLA CAJA X3 150 G',piece:'TORTITA INDIVIDUAL DE VAINILLA 50 G'},
 {flavor:'chocolate',box:'TORTITAS DE CHOCOLATE CAJA X3 150 G',piece:'TORTITA INDIVIDUAL DE CHOCOLATE 50 G'},
 {flavor:'frutos rojos',box:'TORTITAS DE FRUTOS ROJOS CAJA X3 150 G',piece:'TORTITA INDIVIDUAL DE FRUTOS ROJOS 50 G'},
 {flavor:'coco',box:'TORTITAS DE COCO CAJA X3 150 G',piece:'TORTITA INDIVIDUAL DE COCO 50 G'},
 {flavor:'queso',box:'TORTITAS DE QUESO CAJA X3 150 G',piece:'TORTITA INDIVIDUAL DE QUESO 50 G'}
];
export function configureVentoFitTortitas(input){
 const state=structuredClone(input),changes=[],outcomes=[];
 for(const spec of varieties){
  const product=state.items.filter(i=>norm(i.name)===norm(spec.box)&&i.kind==='product'&&i.unit==='u'&&!i.resale&&!i.archived);
  if(product.length!==1){outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'No se identificó una caja única activa con el nombre registrado en Recetas Madre'});continue}
  const box=product[0],recipes=state.recipes.filter(r=>String(r.itemId)===String(box.id));
  if(recipes.length!==1){outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'No existe una única receta para las cajas'});continue}
  const existing=state.items.filter(i=>String(i.convertedFromItemId||'')===String(box.id));
  const exact=state.items.filter(i=>i.kind==='subproduct'&&norm(i.name)===norm(spec.piece));
  const flavorKey=norm(spec.flavor);
  const similar=state.items.filter(i=>i.kind==='subproduct'&&i.unit==='u'&&norm(i.name).includes(flavorKey)&&/TORTIT|PIEZA|INDIVIDUAL/i.test(i.name));
  if(existing.length>1||exact.length>1||(!existing.length&&similar.length>1)||(!existing.length&&similar.length===1&&exact.length===0)){
   outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'Hay subproductos individuales ambiguos; revisar antes de vincular'});continue;
  }
  const piece=existing[0]||exact[0]||null;
  if(piece&&piece.unitsPerBox&&Number(piece.unitsPerBox)!==3){outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'Ya existe otra equivalencia; no se reemplazó'});continue}
  try{
   const result=operate(state,'linkPieces',{boxItemId:box.id,...(piece?{pieceItemId:piece.id}:{pieceName:spec.piece}),unitsPerBox:3});
   const changed=!input.items.some(i=>String(i.id)===String(result.itemId)&&String(i.convertedFromItemId||'')===String(box.id)&&Number(i.unitsPerBox)===3);
   if(changed)changes.push(spec.flavor);
   const ingredientNames=recipes[0].components.map(c=>state.items.find(i=>String(i.id)===String(c.itemId))?.name||'');
   outcomes.push({flavor:spec.flavor,status:'configurada',newLink:changed,shelfLifeDays:recipes[0].shelfLifeDays, ...(spec.flavor==='queso'?{premezclaNeutra:ingredientNames.some(n=>norm(n).includes('PREMEZCLAALMENDRASNEUTRA'))}:{} )});
  }catch(e){outcomes.push({flavor:spec.flavor,status:'pendiente',reason:e.message})}
 }
 return {state,changes,outcomes,changed:changes.length>0};
}
