import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { activeModules } from '@/lib/app-data';
import { marketplaceApps } from '@/lib/app-marketplace-catalog';

test('in-app marketplace exactly matches the canonical 17-module catalog', () => {
  const canonicalIds = activeModules.map((module) => module.id).sort();
  const marketplaceIds = marketplaceApps.map((module) => module.id).sort();
  assert.deepEqual(marketplaceIds, canonicalIds);
  assert.equal(marketplaceApps.length, 17);
  assert.equal(new Set(marketplaceIds).size, 17);
});

test('Tsek-In is available and Farm Track is not advertised', () => {
  const tsekIn = marketplaceApps.find((module) => module.id === 'tsek-in');
  assert.ok(tsekIn);
  assert.equal(tsekIn.name, 'Tsek-In');
  assert.equal(tsekIn.category, 'Hospitality');
  assert.equal(tsekIn.price, 199);
  assert.ok(!marketplaceApps.some((module) => module.id === 'farm-track'));
});

test('Budget Mo and regular module pricing remain compatible with live promo config', () => {
  assert.equal(marketplaceApps.find((module) => module.id === 'budget-mo')?.price, 100);
  for (const module of marketplaceApps.filter((entry) => entry.id !== 'budget-mo')) {
    assert.equal(module.price, 199);
  }
});

test('marketplace component consumes the canonical derived catalog', () => {
  const source = readFileSync('src/components/dashboard/app-marketplace.tsx', 'utf8');
  assert.match(source, /marketplaceApps\.map/);
  assert.doesNotMatch(source, /const APPS\s*=/);
  assert.doesNotMatch(source, /farm-track|Farm Track/);
});
