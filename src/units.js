const UNIT_DEFINITIONS = new Map([
  ['kg', { key: 'kg', dimension: 'mass', factor: 1 }],
  ['kilo', { key: 'kg', dimension: 'mass', factor: 1 }],
  ['kilos', { key: 'kg', dimension: 'mass', factor: 1 }],
  ['kilogramo', { key: 'kg', dimension: 'mass', factor: 1 }],
  ['kilogramos', { key: 'kg', dimension: 'mass', factor: 1 }],
  ['g', { key: 'g', dimension: 'mass', factor: 0.001 }],
  ['gr', { key: 'g', dimension: 'mass', factor: 0.001 }],
  ['gramo', { key: 'g', dimension: 'mass', factor: 0.001 }],
  ['gramos', { key: 'g', dimension: 'mass', factor: 0.001 }],
  ['mg', { key: 'mg', dimension: 'mass', factor: 0.000001 }],
  ['l', { key: 'L', dimension: 'volume', factor: 1 }],
  ['lt', { key: 'L', dimension: 'volume', factor: 1 }],
  ['litro', { key: 'L', dimension: 'volume', factor: 1 }],
  ['litros', { key: 'L', dimension: 'volume', factor: 1 }],
  ['ml', { key: 'ml', dimension: 'volume', factor: 0.001 }],
  ['mililitro', { key: 'ml', dimension: 'volume', factor: 0.001 }],
  ['mililitros', { key: 'ml', dimension: 'volume', factor: 0.001 }],
  ['unidad', { key: 'unidad', dimension: 'count', factor: 1 }],
  ['unidades', { key: 'unidad', dimension: 'count', factor: 1 }],
  ['un', { key: 'unidad', dimension: 'count', factor: 1 }],
  ['feta', { key: 'feta', dimension: 'slice', factor: 1 }],
  ['fetas', { key: 'feta', dimension: 'slice', factor: 1 }]
]);

function normalizedUnit(value) {
  return String(value || '').trim().toLowerCase().replace(/\./g, '');
}

function unitDefinition(value) {
  const normalized = normalizedUnit(value);
  return UNIT_DEFINITIONS.get(normalized) || {
    key: normalized,
    dimension: 'custom:' + normalized,
    factor: 1
  };
}

function baseQuantity(presentationQty, contentPerPresentation, contentUnit, productUnit) {
  const presentations = Number(presentationQty);
  const content = Number(contentPerPresentation);
  if (!Number.isFinite(presentations) || presentations <= 0 || !Number.isFinite(content) || content <= 0) {
    throw new Error('La cantidad y el contenido por presentación deben ser mayores que cero.');
  }
  const source = unitDefinition(contentUnit);
  const target = unitDefinition(productUnit);
  if (!source.key || !target.key || source.dimension !== target.dimension) {
    throw new Error('La unidad del contenido (' + contentUnit + ') no se puede convertir a la unidad de stock (' + productUnit + ').');
  }
  const result = presentations * content * source.factor / target.factor;
  const rounded = Math.round((result + Number.EPSILON) * 1000) / 1000;
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new Error('La cantidad total calculada no es válida.');
  }
  return rounded;
}

function displayQuantity(value) {
  return Number(value).toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

module.exports = { baseQuantity, displayQuantity, normalizedUnit, unitDefinition };
