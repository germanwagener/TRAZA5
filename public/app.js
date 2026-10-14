function applyTableFilters(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const textInput = document.querySelector(`.filter[data-table="${tableId}"]`);
  const dateControls = document.querySelector(`[data-date-filter="${tableId}"]`);
  const from = dateControls?.querySelector('[data-date-from]')?.value || '';
  const to = dateControls?.querySelector('[data-date-to]')?.value || '';
  const query = (textInput?.value || '').toLowerCase().trim();
  for (const row of table.querySelectorAll('tbody tr')) {
    const date = row.dataset.date || '';
    const matchesText = !query || row.innerText.toLowerCase().includes(query);
    const matchesFrom = !from || Boolean(date && date >= from);
    const matchesTo = !to || Boolean(date && date <= to);
    row.style.display = matchesText && matchesFrom && matchesTo ? '' : 'none';
  }
  const summary = document.querySelector(`[data-print-summary="${tableId}"]`);
  if (summary) {
    const period = from && to
      ? `Del ${formatDateAr(from)} al ${formatDateAr(to)}`
      : (from ? `Desde ${formatDateAr(from)}` : (to ? `Hasta ${formatDateAr(to)}` : 'Todos los registros'));
    summary.textContent = `Período: ${period}${query ? ' · Búsqueda: ' + query : ''}`;
  }
}

function formatDateAr(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function setupFilters() {
  document.querySelectorAll('.filter[data-table]').forEach(input => {
    input.addEventListener('input', () => applyTableFilters(input.dataset.table));
    applyTableFilters(input.dataset.table);
  });

  document.querySelectorAll('[data-list-filter]').forEach(input => {
    const container = document.getElementById(input.dataset.listFilter);
    if (!container) return;
    const update = () => {
      const query = input.value.toLowerCase().trim();
      container.querySelectorAll('[data-filter-item]').forEach(item => {
        item.style.display = !query || item.innerText.toLowerCase().includes(query) ? '' : 'none';
      });
    };
    input.addEventListener('input', update);
    update();
  });

  document.querySelectorAll('[data-select-filter]').forEach(input => {
    const select = document.getElementById(input.dataset.selectFilter);
    if (!select) return;
    const update = () => {
      const query = input.value.toLowerCase().trim();
      [...select.options].forEach(option => {
        if (!option.value) return;
        option.hidden = Boolean(query && !option.textContent.toLowerCase().includes(query));
      });
    };
    input.addEventListener('input', update);
    update();
  });
}

function setupDateFilters() {
  document.querySelectorAll('[data-date-filter]').forEach(controls => {
    const tableId = controls.dataset.dateFilter;
    controls.querySelectorAll('[data-date-from],[data-date-to]').forEach(input => {
      input.addEventListener('change', () => applyTableFilters(tableId));
    });
    const today = controls.querySelector('[data-date-today]');
    if (today) {
      today.addEventListener('click', () => {
        const value = new Date().toISOString().slice(0, 10);
        controls.querySelector('[data-date-from]').value = value;
        controls.querySelector('[data-date-to]').value = value;
        applyTableFilters(tableId);
      });
    }
    const clear = controls.querySelector('[data-date-clear]');
    if (clear) {
      clear.addEventListener('click', () => {
        controls.querySelector('[data-date-from]').value = '';
        controls.querySelector('[data-date-to]').value = '';
        applyTableFilters(tableId);
      });
    }
    applyTableFilters(tableId);
  });
}

const UNIT_DEFINITIONS = new Map([
  ['kg', { dimension: 'mass', factor: 1 }],
  ['kilo', { dimension: 'mass', factor: 1 }],
  ['kilos', { dimension: 'mass', factor: 1 }],
  ['kilogramo', { dimension: 'mass', factor: 1 }],
  ['kilogramos', { dimension: 'mass', factor: 1 }],
  ['g', { dimension: 'mass', factor: 0.001 }],
  ['gr', { dimension: 'mass', factor: 0.001 }],
  ['gramo', { dimension: 'mass', factor: 0.001 }],
  ['gramos', { dimension: 'mass', factor: 0.001 }],
  ['mg', { dimension: 'mass', factor: 0.000001 }],
  ['l', { dimension: 'volume', factor: 1 }],
  ['lt', { dimension: 'volume', factor: 1 }],
  ['litro', { dimension: 'volume', factor: 1 }],
  ['litros', { dimension: 'volume', factor: 1 }],
  ['ml', { dimension: 'volume', factor: 0.001 }],
  ['mililitro', { dimension: 'volume', factor: 0.001 }],
  ['mililitros', { dimension: 'volume', factor: 0.001 }],
  ['unidad', { dimension: 'count', factor: 1 }],
  ['unidades', { dimension: 'count', factor: 1 }],
  ['un', { dimension: 'count', factor: 1 }],
  ['feta', { dimension: 'slice', factor: 1 }],
  ['fetas', { dimension: 'slice', factor: 1 }]
]);

function unitDefinition(value) {
  const key = String(value || '').trim().toLowerCase().replace(/\./g, '');
  return UNIT_DEFINITIONS.get(key) || { dimension: `custom:${key}`, factor: 1 };
}

function calculateBaseQuantity(presentationQty, contentPerPresentation, contentUnit, productUnit) {
  const presentations = Number(presentationQty);
  const content = Number(contentPerPresentation);
  const source = unitDefinition(contentUnit);
  const target = unitDefinition(productUnit);
  if (!Number.isFinite(presentations) || presentations <= 0 || !Number.isFinite(content) || content <= 0) return null;
  if (source.dimension !== target.dimension) return null;
  const result = presentations * content * source.factor / target.factor;
  return Math.round((result + Number.EPSILON) * 1000) / 1000;
}

function setSelectValue(select, value) {
  if (!select || !value) return;
  if (![...select.options].some(option => option.value === String(value))) {
    select.add(new Option(String(value), String(value)));
  }
  select.value = String(value);
}

function setupReceipt() {
  const product = document.getElementById('receiptProduct');
  const brand = document.getElementById('receiptBrand');
  const supplier = document.getElementById('receiptSupplier');
  const hint = document.getElementById('supplierHint');
  const presentationQty = document.getElementById('receiptPresentationQty');
  const presentationUnit = document.getElementById('receiptPresentationUnit');
  const contentPerPresentation = document.getElementById('receiptContentPerPresentation');
  const contentUnit = document.getElementById('receiptContentUnit');
  const preview = document.getElementById('receiptTotalPreview');
  if (!product || !brand || !supplier) return;

  const supplierOptions = [...supplier.options].filter(option => option.value);

  const selectedProduct = () => product.selectedOptions[0];

  const supplierConfigurations = () => {
    const encoded = selectedProduct()?.dataset.presentations || '';
    if (!encoded) return [];
    try {
      return JSON.parse(decodeURIComponent(encoded));
    } catch (error) {
      return [];
    }
  };

  const applyPresentation = () => {
    const selected = selectedProduct();
    if (!selected || !product.value) return;
    const configuration = supplierConfigurations().find(item => String(item.supplier_id) === String(supplier.value));
    setSelectValue(presentationUnit, configuration?.presentation_unit || selected.dataset.presentationUnit || 'unidad');
    contentPerPresentation.value = configuration?.content_per_presentation || selected.dataset.contentPerPresentation || '1';
    setSelectValue(contentUnit, configuration?.content_unit || selected.dataset.contentUnit || selected.dataset.unit);
    updatePreview();
  };

  const updatePreview = () => {
    if (!preview) return;
    const selected = selectedProduct();
    if (!selected || !product.value) {
      preview.textContent = 'Seleccioná un producto para calcular el stock disponible.';
      preview.classList.remove('error');
      return;
    }
    const total = calculateBaseQuantity(
      presentationQty?.value,
      contentPerPresentation?.value,
      contentUnit?.value,
      selected.dataset.unit
    );
    if (total === null) {
      preview.textContent = 'Completá cantidades compatibles con la unidad de stock del producto.';
      preview.classList.add('error');
      return;
    }
    const received = `${presentationQty.value} ${presentationUnit.value}`;
    preview.textContent = `${received} × ${contentPerPresentation.value} ${contentUnit.value} = ${total.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${selected.dataset.unit} disponibles para producción`;
    preview.classList.remove('error');
  };

  const updateProduct = () => {
    const selected = selectedProduct();
    brand.value = selected?.dataset.brand || '';
    const supplierIds = (selected?.dataset.suppliers || '').split(',').filter(Boolean);
    const hasProduct = Boolean(product.value);
    supplier.disabled = !hasProduct;
    supplierOptions.forEach(option => {
      option.hidden = supplierIds.length > 0 && !supplierIds.includes(option.value);
    });
    if (!hasProduct) {
      supplier.value = '';
      supplier.options[0].textContent = 'Primero seleccioná el producto...';
      if (hint) hint.textContent = 'El proveedor se completará automáticamente cuando exista una sola opción.';
      updatePreview();
      return;
    }
    supplier.options[0].textContent = 'Seleccionar proveedor...';
    if (supplierIds.length === 1) {
      supplier.value = supplierIds[0];
      if (hint) hint.textContent = 'Proveedor y presentación seleccionados automáticamente.';
    } else if (supplierIds.length > 1) {
      if (!supplierIds.includes(supplier.value)) supplier.value = '';
      if (hint) hint.textContent = 'Este producto tiene varios proveedores. Elegí el que realizó la entrega.';
    } else {
      supplier.value = '';
      if (hint) hint.textContent = 'Este producto no tiene proveedor configurado. Podés elegir uno de la empresa.';
    }
    applyPresentation();
  };

  product.addEventListener('change', updateProduct);
  supplier.addEventListener('change', applyPresentation);
  [presentationQty, presentationUnit, contentPerPresentation, contentUnit].forEach(field => {
    field?.addEventListener('input', updatePreview);
    field?.addEventListener('change', updatePreview);
  });
  updateProduct();
}

function setupProductPresentation() {
  const form = document.querySelector('form[action="/admin/products"]');
  if (!form) return;
  const stockUnit = form.querySelector('[name="unit"]');
  const contentUnit = form.querySelector('[name="default_content_unit"]');
  if (!stockUnit || !contentUnit) return;
  let previousUnit = stockUnit.value;
  stockUnit.addEventListener('change', () => {
    if (!contentUnit.value || contentUnit.value === previousUnit) contentUnit.value = stockUnit.value;
    previousUnit = stockUnit.value;
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function addRecipeItem() {
  const box = document.getElementById('recipeItems');
  if (!box || !window.TRAZA_PRODUCTS) return;
  const row = document.createElement('div');
  row.className = 'recipe-row';
  row.innerHTML = `<select name="input_product_id">${window.TRAZA_PRODUCTS.map(product => `<option value="${product.id}">${escapeHtml(product.name)} · ${escapeHtml(product.unit)}${product.supplier_names ? ' · ' + escapeHtml(product.supplier_names) : ''}</option>`).join('')}</select><input type="number" step="0.001" min="0" name="input_qty" placeholder="Cantidad"><select name="input_scope" aria-label="Producto al que corresponde el ingrediente"><option value="both">Ambos productos</option><option value="primary">Solo producto 1</option><option value="secondary">Solo producto 2</option></select><button type="button" class="secondary small">Quitar</button>`;
  row.querySelector('button').addEventListener('click', () => row.remove());
  box.appendChild(row);
}

let currentRecipeItems = [];
let currentProductionRecipe = null;

function productionScopeLabel(scope, recipe) {
  if (scope === 'primary') return `solo ${recipe.output_product}`;
  if (scope === 'secondary') return `solo ${recipe.secondary_output_product}`;
  return recipe.secondary_output_product ? 'masa / componente común de ambos productos' : 'componente de la elaboración';
}

function updateProductionOutputFields(recipe) {
  const single = document.getElementById('singleOutputField');
  const split = document.getElementById('splitOutputFields');
  const singleInput = document.querySelector('input[name="output_qty"]');
  const primaryInput = document.querySelector('input[name="primary_output_qty"]');
  const secondaryInput = document.querySelector('input[name="secondary_output_qty"]');
  const isSplit = Boolean(recipe?.secondary_output_product_id);
  if (single) single.hidden = isSplit;
  if (split) split.hidden = !isSplit;
  if (singleInput) singleInput.required = !isSplit;
  if (primaryInput) primaryInput.required = isSplit;
  if (secondaryInput) secondaryInput.required = isSplit;
  const primaryName = document.getElementById('primaryOutputName');
  const secondaryName = document.getElementById('secondaryOutputName');
  if (primaryName) primaryName.textContent = recipe?.output_product || 'Producto 1';
  if (secondaryName) secondaryName.textContent = recipe?.secondary_output_product || 'Producto 2';
}

function scaleProductionInputs() {
  if (!currentProductionRecipe) return;
  const nominal = Number(currentProductionRecipe.output_qty || 1);
  const isSplit = Boolean(currentProductionRecipe.secondary_output_product_id);
  const primary = Number(document.querySelector('input[name="primary_output_qty"]')?.value || 0);
  const secondary = Number(document.querySelector('input[name="secondary_output_qty"]')?.value || 0);
  const single = Number(document.querySelector('input[name="output_qty"]')?.value || 0);
  document.querySelectorAll('.source-row[data-autocalc="true"]').forEach(row => {
    const item = currentRecipeItems.find(candidate => String(candidate.product_id) === String(row.dataset.product));
    const input = row.querySelector('input[name=source_qty]');
    if (!item || !input) return;
    const basis = !isSplit
      ? single
      : (item.output_scope === 'primary' ? primary : (item.output_scope === 'secondary' ? secondary : primary + secondary));
    input.value = basis > 0 ? (Number(item.qty) * basis / nominal).toFixed(3) : '';
  });
}

async function loadProductionRecipe() {
  const select = document.getElementById('prodRecipe');
  const summary = document.getElementById('recipeSummary');
  const box = document.getElementById('sourceRows');
  if (!select || !summary || !box) return;
  box.innerHTML = '';
  currentRecipeItems = [];
  if (!select.value) {
    currentProductionRecipe = null;
    updateProductionOutputFields(null);
    summary.textContent = 'Seleccioná una receta.';
    return;
  }
  const data = await fetch('/api/recipe/' + select.value).then(response => response.json());
  currentProductionRecipe = data.recipe;
  currentRecipeItems = data.items || [];
  updateProductionOutputFields(data.recipe);
  summary.innerHTML = data.recipe.secondary_output_product_id
    ? `<b>${escapeHtml(data.recipe.sector)} · ${escapeHtml(data.recipe.name)} v${escapeHtml(data.recipe.version)}</b><br>Producción dividida: <b>${escapeHtml(data.recipe.output_product)}</b> + <b>${escapeHtml(data.recipe.secondary_output_product)}</b>. La masa común se reparte automáticamente según las cantidades producidas.`
    : `<b>${escapeHtml(data.recipe.sector)} · ${escapeHtml(data.recipe.name)} v${escapeHtml(data.recipe.version)}</b><br>Resultado: ${escapeHtml(data.recipe.output_product)} · rendimiento nominal ${data.recipe.output_qty} ${escapeHtml(data.recipe.output_unit)}.`;
  for (const item of currentRecipeItems) await addSourceRow(item, true);
  scaleProductionInputs();
}

async function lotOptions(productId) {
  const rows = await fetch('/api/lots/' + productId).then(response => response.json());
  return rows.map(row => `<option value="${row.source_id}" data-type="${row.source_type}">${escapeHtml(row.lot)} · disp. ${row.available} · ${escapeHtml(row.origin)}${row.expires ? ' · vence ' + escapeHtml(row.expires) : ''}</option>`).join('');
}

async function addSourceRow(item, prefill = false) {
  const box = document.getElementById('sourceRows');
  if (!box) return;
  const chosen = item || currentRecipeItems[0];
  if (!chosen) return;
  const options = await lotOptions(chosen.product_id);
  const row = document.createElement('div');
  row.className = 'source-row';
  row.dataset.product = chosen.product_id;
  row.dataset.autocalc = prefill ? 'true' : 'false';
  row.innerHTML = `<div><b>${escapeHtml(chosen.name)}</b><div class="lot-info">${escapeHtml(chosen.category)} · receta ${chosen.qty} ${escapeHtml(chosen.unit)} · ${escapeHtml(productionScopeLabel(chosen.output_scope, currentProductionRecipe || {}))}</div><input type="hidden" name="source_product_id" value="${chosen.product_id}"></div><select name="source_id" required><option value="">Seleccionar lote disponible...</option>${options}</select><input type="hidden" name="source_type" value="receipt"><input type="number" step="0.001" min="0.001" name="source_qty" value="${prefill ? chosen.qty : ''}" placeholder="Cantidad" required><button type="button" class="secondary small">Quitar</button>`;
  const select = row.querySelector('select');
  const type = row.querySelector('input[name=source_type]');
  select.addEventListener('change', () => { type.value = select.selectedOptions[0]?.dataset.type || 'receipt'; });
  row.querySelector('button').addEventListener('click', () => row.remove());
  box.appendChild(row);
}

function setupProduction() {
  const recipe = document.getElementById('prodRecipe');
  if (!recipe) return;
  recipe.addEventListener('change', loadProductionRecipe);
  const add = document.getElementById('addSourceManual');
  if (add) {
    add.addEventListener('click', async () => {
      if (!currentRecipeItems.length) return alert('Primero seleccioná una receta.');
      const names = currentRecipeItems.map((item, index) => `${index + 1}. ${item.name}`).join('\n');
      const selected = Number(prompt('¿Para qué ingrediente querés agregar otro lote?\n' + names));
      if (selected >= 1 && selected <= currentRecipeItems.length) await addSourceRow(currentRecipeItems[selected - 1], false);
    });
  }
  document.querySelectorAll('input[name=output_qty],input[name=primary_output_qty],input[name=secondary_output_qty]').forEach(input => {
    input.addEventListener('input', scaleProductionInputs);
    input.addEventListener('change', scaleProductionInputs);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupFilters();
  setupDateFilters();
  setupReceipt();
  setupProductPresentation();
  setupProduction();
  document.getElementById('addRecipeItem')?.addEventListener('click', addRecipeItem);
});
