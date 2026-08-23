import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLineFinancials,
  parseDecimalToMinor,
  formatMinorToDecimal,
  isMeasuredUnit,
  isValidQuantityScale,
  STANDARD_MEASURED_SCALE
} from '../src/lib/shared/quantity-math';
import {
  validateAndAggregateIntentItems
} from '../src/lib/server/benta-cashier-intent-finalizer';
import {
  canonicalizeCatalogProducts,
  generateCatalogDigest,
  generateServerCatalogDigest
} from '../src/lib/server/catalog-snapshot-service';

test('computeLineFinancials computes exact line financials with half-up rounding on fractional centavos', () => {
  // Example: 1.250 kg @ ₱220.00/kg (22000 centavos)
  // 22000 * 1250 / 1000 = 27500 centavos (₱275.00)
  assert.equal(computeLineFinancials(22000, 1250, 3), 27500);

  // Fractional centavo rounding check:
  // 150 centavos (₱1.50) * 333 minor (0.333 kg) / 1000 = 49.95 centavos -> rounds to 50 centavos
  assert.equal(computeLineFinancials(150, 333, 3), 50);

  // Exact half rounding check:
  // 15 centavos * 100 minor / 1000 = 1.5 centavos -> rounds to 2 centavos
  assert.equal(computeLineFinancials(15, 100, 3), 2);

  // 15 centavos * 300 minor / 1000 = 4.5 centavos -> rounds to 5 centavos
  assert.equal(computeLineFinancials(15, 300, 3), 5);
});

test('computeLineFinancials fails closed on invalid prices or out-of-bound quantities', () => {
  assert.throws(() => computeLineFinancials(-100, 1000, 3));
  assert.throws(() => computeLineFinancials(100, -10, 3));
  assert.throws(() => computeLineFinancials(100, 0, 3));
  assert.throws(() => computeLineFinancials(100, 20_000_000, 3)); // exceeds 10,000,000 minor units
});

test('parseDecimalToMinor and formatMinorToDecimal conversions are lossless and accurate', () => {
  assert.deepEqual(parseDecimalToMinor('1.25', 3), { minor: 1250, valid: true });
  assert.deepEqual(parseDecimalToMinor('0.5', 3), { minor: 500, valid: true });
  assert.deepEqual(parseDecimalToMinor('0.005', 3), { minor: 5, valid: true });
  assert.deepEqual(parseDecimalToMinor('10', 3), { minor: 10000, valid: true });

  assert.equal(formatMinorToDecimal(1250, 3), '1.25');
  assert.equal(formatMinorToDecimal(500, 3), '0.5');
  assert.equal(formatMinorToDecimal(5, 3), '0.005');
  assert.equal(formatMinorToDecimal(10000, 3), '10');
});

test('isMeasuredUnit and isValidQuantityScale validate supported units and precision', () => {
  assert.equal(isMeasuredUnit('kg'), true);
  assert.equal(isMeasuredUnit('g'), true);
  assert.equal(isMeasuredUnit('m'), true);
  assert.equal(isMeasuredUnit('ft'), true);
  assert.equal(isMeasuredUnit('pcs'), false);
  assert.equal(isMeasuredUnit('box'), false);

  assert.equal(isValidQuantityScale(3), true);
  assert.equal(isValidQuantityScale(2), false);
});

test('validateAndAggregateIntentItems aggregates legacy schema v1 discrete items deterministically', () => {
  const rawItems = [
    { productId: 'prod_b', quantity: 2, observedUnitPriceCentavos: 5000 },
    { productId: 'prod_a', quantity: 1, observedUnitPriceCentavos: 1000 },
    { productId: 'prod_b', quantity: 3, observedUnitPriceCentavos: 5000 }
  ];

  const aggregated = validateAndAggregateIntentItems(rawItems);
  assert.equal(aggregated.length, 2);
  assert.deepEqual(aggregated[0], {
    productId: 'prod_a',
    quantityMode: 'discrete',
    quantity: 1,
    observedUnitPriceCentavos: 1000
  });
  assert.deepEqual(aggregated[1], {
    productId: 'prod_b',
    quantityMode: 'discrete',
    quantity: 5,
    observedUnitPriceCentavos: 5000
  });
});

test('validateAndAggregateIntentItems aggregates schema v2 measured items deterministically', () => {
  const rawItems = [
    { productId: 'prod_pork', quantityMode: 'measured', quantityMinor: 1250, quantityScale: 3, sellingUnit: 'kg', observedUnitPriceCentavos: 28000 },
    { productId: 'prod_pork', quantityMode: 'measured', quantityMinor: 500, quantityScale: 3, sellingUnit: 'kg', observedUnitPriceCentavos: 28000 }
  ];

  const aggregated = validateAndAggregateIntentItems(rawItems);
  assert.equal(aggregated.length, 1);
  assert.deepEqual(aggregated[0], {
    productId: 'prod_pork',
    quantityMode: 'measured',
    quantityMinor: 1750,
    quantityScale: 3,
    sellingUnit: 'kg',
    observedUnitPriceCentavos: 28000
  });
});

test('validateAndAggregateIntentItems fails closed when combining mixed modes on the same product ID', () => {
  const invalidMixed = [
    { productId: 'prod_x', quantityMode: 'discrete', quantity: 2 },
    { productId: 'prod_x', quantityMode: 'measured', quantityMinor: 1000, quantityScale: 3, sellingUnit: 'kg' }
  ];
  assert.throws(() => validateAndAggregateIntentItems(invalidMixed));
});

test('canonicalizeCatalogProducts and digests include variable quantity attributes while strictly omitting volatile stock', () => {
  const productsInput = [
    {
      id: 'prod_rice',
      name: 'Sinandomeng Rice',
      salePrice: 5000,
      costPrice: 4200,
      currentStock: 100,
      stockQuantityMinor: 100000,
      quantityMode: 'measured' as const,
      sellingUnit: 'kg',
      quantityScale: 3,
      unit: 'kg'
    },
    {
      id: 'prod_soap',
      name: 'Bath Soap',
      salePrice: 3500,
      costPrice: 2800,
      currentStock: 25,
      unit: 'pcs',
      quantityMode: 'discrete' as const
    }
  ];

  const canonical = canonicalizeCatalogProducts(productsInput);
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0].id, 'prod_rice');
  assert.equal(canonical[0].quantityMode, 'measured');
  assert.equal(canonical[1].id, 'prod_soap');
  assert.equal(canonical[1].quantityMode, 'discrete');

  const digest1 = generateCatalogDigest(canonical);
  const serverDigest1 = generateServerCatalogDigest(canonical);

  assert.equal(typeof digest1, 'string');
  assert.equal(digest1.length, 64);
  assert.equal(typeof serverDigest1, 'string');
  assert.equal(serverDigest1.length, 64);

  // Changing volatile stock MUST NOT alter catalog digest
  const modifiedStockProducts = [
    { ...productsInput[0], currentStock: 0, stockQuantityMinor: 0 },
    { ...productsInput[1], currentStock: 500 }
  ];
  const canonicalMod = canonicalizeCatalogProducts(modifiedStockProducts);
  const digest2 = generateCatalogDigest(canonicalMod);

  assert.equal(digest2, digest1);
});
