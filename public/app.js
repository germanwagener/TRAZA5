function setupFilters(){document.querySelectorAll('.filter[data-table]').forEach(input=>{input.addEventListener('input',()=>{const q=input.value.toLowerCase().trim();const table=document.getElementById(input.dataset.table);if(!table)return;[...table.querySelectorAll('tbody tr')].forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none')})})}
function setupReceipt(){
  const product=document.getElementById('receiptProduct');
  const brand=document.getElementById('receiptBrand');
  const brandField=document.getElementById('receiptBrandManualField');
  const brandVariantField=document.getElementById('receiptBrandVariantField');
  const brandVariant=document.getElementById('receiptBrandVariant');
  const rnpa=document.getElementById('receiptRnpa');
  const supplier=document.getElementById('receiptSupplier');
  const hint=document.getElementById('supplierHint');
  if(!product||!brand||!brandVariant||!rnpa||!supplier)return;
  const options=[...supplier.options].filter(option=>option.value);
  const updateBrands=()=>{
    const selected=product.selectedOptions[0];
    let brands=[];
    try{brands=JSON.parse(selected?.dataset.brands||'[]')}catch(_error){brands=[]}
    brandVariant.innerHTML='<option value="">Seleccionar marca...</option>';
    if(brands.length){
      brands.forEach(item=>{
        const option=document.createElement('option');
        option.value=item.id;
        option.dataset.rnpa=item.rnpa||'';
        option.textContent=item.brand+(item.rnpa?' · RNPA '+item.rnpa:'');
        brandVariant.appendChild(option);
      });
      brandVariant.disabled=false;
      brandVariant.required=true;
      brandVariantField.hidden=false;
      brandField.hidden=true;
      brandVariant.value=brands.length===1?String(brands[0].id):'';
      rnpa.readOnly=true;
      rnpa.value=brands.length===1?(brands[0].rnpa||''):'';
    }else{
      brandVariant.disabled=true;
      brandVariant.required=false;
      brandVariant.value='';
      brandVariantField.hidden=true;
      brandField.hidden=false;
      brand.value=selected?.dataset.brand||'';
      rnpa.readOnly=false;
      rnpa.value='';
    }
  };
  brandVariant.addEventListener('change',()=>{
    rnpa.value=brandVariant.selectedOptions[0]?.dataset.rnpa||'';
  });
  const update=()=>{
    const selected=product.selectedOptions[0];
    const supplierIds=(selected?.dataset.suppliers||'').split(',').filter(Boolean);
    const hasProduct=Boolean(product.value);
    updateBrands();
    supplier.disabled=!hasProduct;
    for(const option of options){
      option.hidden=supplierIds.length>0&&!supplierIds.includes(option.value);
    }
    if(!hasProduct){
      supplier.value='';
      supplier.options[0].textContent='Primero seleccioná el producto...';
      if(hint)hint.textContent='El proveedor se completará automáticamente cuando exista una sola opción.';
      return;
    }
    supplier.options[0].textContent='Seleccionar proveedor...';
    if(supplierIds.length===1){
      supplier.value=supplierIds[0];
      if(hint)hint.textContent='Proveedor seleccionado automáticamente.';
    }else if(supplierIds.length>1){
      if(!supplierIds.includes(supplier.value))supplier.value='';
      if(hint)hint.textContent='Este producto tiene varios proveedores habilitados. Elegí el que realizó la entrega.';
    }else{
      supplier.value='';
      if(hint)hint.textContent='Este producto no tiene proveedor configurado. Podés elegir uno de la empresa.';
    }
  };
  product.addEventListener('change',update);
  update();
}
function createBrandEntry(){
  const row=document.createElement('div');
  row.className='brand-entry';
  row.innerHTML='<input type="hidden" name="brand_id" value=""><label>Marca<input name="brand_name" autocomplete="off"></label><label>RNPA<input name="brand_rnpa" autocomplete="off"></label><button type="button" class="small secondary" data-remove-brand>Quitar</button>';
  return row;
}
function setupBrandRows(){
  document.querySelectorAll('[data-add-brand]').forEach(button=>{
    button.addEventListener('click',()=>{
      const list=button.parentElement.querySelector('[data-brand-list]')||button.closest('form')?.querySelector('[data-brand-list]');
      if(list)list.appendChild(createBrandEntry());
    });
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-brand]');
    if(button)button.closest('.brand-entry')?.remove();
  });
  const category=document.getElementById('newProductCategory');
  const section=document.getElementById('newProductBrandSection');
  const defaultBrand=document.getElementById('newProductDefaultBrandField');
  if(category&&section){
    const update=()=>{
      const isRaw=category.value==='Materia prima';
      section.hidden=!isRaw;
      if(defaultBrand)defaultBrand.hidden=isRaw;
    };
    category.addEventListener('change',update);
    update();
  }
}
function addRecipeItem(){const box=document.getElementById('recipeItems');if(!box||!window.TRAZA_PRODUCTS)return;const row=document.createElement('div');row.className='recipe-row';row.innerHTML=`<select name="input_product_id">${window.TRAZA_PRODUCTS.map(p=>`<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.unit)}${p.supplier_names?' · '+escapeHtml(p.supplier_names):''}</option>`).join('')}</select><input type="number" step="0.001" min="0" name="input_qty" placeholder="Cantidad"><button type="button" class="secondary small" onclick="this.parentElement.remove()">Quitar</button>`;box.appendChild(row)}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
let currentRecipeItems=[];
async function loadProductionRecipe(){const select=document.getElementById('prodRecipe'),summary=document.getElementById('recipeSummary'),box=document.getElementById('sourceRows');if(!select||!summary||!box)return;box.innerHTML='';currentRecipeItems=[];if(!select.value){summary.textContent='Seleccioná una receta.';return}const data=await fetch('/api/recipe/'+select.value).then(r=>r.json());currentRecipeItems=data.items||[];summary.innerHTML=`<b>${escapeHtml(data.recipe.sector)} · ${escapeHtml(data.recipe.name)} v${escapeHtml(data.recipe.version)}</b><br>Resultado: ${escapeHtml(data.recipe.output_product)} · rendimiento nominal ${data.recipe.output_qty} ${escapeHtml(data.recipe.output_unit)}.`;for(const item of currentRecipeItems)await addSourceRow(item,true)}
async function lotOptions(productId){const rows=await fetch('/api/lots/'+productId).then(r=>r.json());return rows.map(r=>`<option value="${r.source_id}" data-type="${r.source_type}">${escapeHtml(r.lot)}${r.brand?' · '+escapeHtml(r.brand):''}${r.rnpa?' · RNPA '+escapeHtml(r.rnpa):''} · disp. ${r.available} · ${escapeHtml(r.origin)}${r.expires?' · vence '+escapeHtml(r.expires):''}</option>`).join('')}
async function addSourceRow(item,prefill=false){const box=document.getElementById('sourceRows');if(!box)return;let chosen=item;if(!chosen){if(!currentRecipeItems.length)return;chosen=currentRecipeItems[0]}const opts=await lotOptions(chosen.product_id);const row=document.createElement('div');row.className='source-row';row.dataset.product=chosen.product_id;row.innerHTML=`<div><b>${escapeHtml(chosen.name)}</b><div class="lot-info">${escapeHtml(chosen.category)} · receta ${chosen.qty} ${escapeHtml(chosen.unit)}</div><input type="hidden" name="source_product_id" value="${chosen.product_id}"></div><select name="source_id" required><option value="">Seleccionar lote disponible...</option>${opts}</select><input type="hidden" name="source_type" value="receipt"><input type="number" step="0.001" min="0.001" name="source_qty" value="${prefill?chosen.qty:''}" placeholder="Cantidad" required><button type="button" class="secondary small">Quitar</button>`;const sel=row.querySelector('select');const type=row.querySelector('input[name=source_type]');sel.addEventListener('change',()=>{type.value=sel.selectedOptions[0]?.dataset.type||'receipt'});row.querySelector('button').addEventListener('click',()=>row.remove());box.appendChild(row)}
function setupProduction(){const r=document.getElementById('prodRecipe');if(!r)return;r.addEventListener('change',loadProductionRecipe);const add=document.getElementById('addSourceManual');if(add)add.addEventListener('click',async()=>{if(!currentRecipeItems.length)return alert('Primero seleccioná una receta.');const names=currentRecipeItems.map((x,i)=>`${i+1}. ${x.name}`).join('\n');const n=Number(prompt('¿Para qué ingrediente querés agregar otro lote?\n'+names));if(n>=1&&n<=currentRecipeItems.length)await addSourceRow(currentRecipeItems[n-1],false)});const out=document.querySelector('input[name=output_qty]');if(out)out.addEventListener('change',()=>{const recipeSelect=document.getElementById('prodRecipe');if(!recipeSelect?.value||!currentRecipeItems.length)return;fetch('/api/recipe/'+recipeSelect.value).then(r=>r.json()).then(data=>{const factor=Number(out.value||0)/Number(data.recipe.output_qty||1);document.querySelectorAll('.source-row').forEach(row=>{const item=currentRecipeItems.find(i=>String(i.product_id)===String(row.dataset.product));const input=row.querySelector('input[name=source_qty]');if(item&&input)input.value=(Number(item.qty)*factor).toFixed(3)})})})}
document.addEventListener('DOMContentLoaded',()=>{setupFilters();setupReceipt();setupBrandRows();setupProduction();const add=document.getElementById('addRecipeItem');if(add)add.addEventListener('click',addRecipeItem)})
