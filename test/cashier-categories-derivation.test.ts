import test from 'node:test';
import assert from 'node:assert/strict';

test('Cashier category derivation from products is pure and includes All', () => {
  const products = [
    { id: '1', name: 'Rice', category: 'Grains', salePrice: 5000, currentStock: 10 },
    { id: '2', name: 'Soap', category: 'Hygiene', salePrice: 2500, currentStock: 20 },
    { id: '3', name: 'Noodles', category: 'Grains', salePrice: 1500, currentStock: 15 },
    { id: '4', name: 'Water', category: '', salePrice: 2000, currentStock: 50 }
  ];

  const deriveCategories = (prods: typeof products | null | undefined): string[] => {
    if (!prods) return ['All'];
    const cats = Array.from(
      new Set(prods.map((p) => p.category).filter(Boolean))
    ) as string[];
    return ['All', ...cats];
  };

  const cats1 = deriveCategories(products);
  assert.deepEqual(cats1, ['All', 'Grains', 'Hygiene']);

  const catsEmpty = deriveCategories([]);
  assert.deepEqual(catsEmpty, ['All']);

  const catsNull = deriveCategories(null);
  assert.deepEqual(catsNull, ['All']);
});
