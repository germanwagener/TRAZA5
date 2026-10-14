const test = require('node:test');
const assert = require('node:assert/strict');
const { baseQuantity } = require('../src/units');

test('convierte bidones a litros', () => {
  assert.equal(baseQuantity(6, 5, 'L', 'L'), 30);
});

test('convierte gramos a kilos', () => {
  assert.equal(baseQuantity(2, 2500, 'g', 'kg'), 5);
});

test('convierte cajas a unidades', () => {
  assert.equal(baseQuantity(3, 12, 'unidades', 'unidad'), 36);
});

test('admite fetas como unidad de producción', () => {
  assert.equal(baseQuantity(4, 25, 'fetas', 'feta'), 100);
});

test('rechaza conversiones incompatibles', () => {
  assert.throws(() => baseQuantity(2, 5, 'L', 'kg'), /no se puede convertir/);
});

test('rechaza cantidades inválidas', () => {
  assert.throws(() => baseQuantity(0, 5, 'L', 'L'), /mayores que cero/);
});
