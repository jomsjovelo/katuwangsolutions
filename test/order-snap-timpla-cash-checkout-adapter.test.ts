/**
 * Timpla Cash Checkout Adapter Tests
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createTimplaCashCheckoutAttemptId,
  parseCashTenderedCentavos,
  buildOrderSnapCashCheckoutRequest,
} from "../src/lib/order-snap/timpla-cash-checkout-adapter";
import { createDeterministicTestProvider } from "../src/lib/order-snap/secure-id-utils";

const VALID_ITEM = {
  menuItemId: "item_latte",
  quantity: 1,
  selectedModifiers: [{ groupId: "grp_syrup", optionId: "opt_vanilla" }],
};

function buildParams(overrides: Record<string, unknown> = {}) {
  return {
    cart: [VALID_ITEM],
    cashTendered: "100",
    idempotencyKey: "idemp_test_001",
    paymentMethod: "cash",
    discountCentavos: 0,
    loyaltyDiscountCentavos: 0,
    activeTableId: null,
    ...overrides,
  };
}

test("1. deterministic attempt ID is idemp_-prefixed", () => {
  const provider = createDeterministicTestProvider("abc123");
  const id = createTimplaCashCheckoutAttemptId(provider);
  assert.ok(id.startsWith("idemp_"));
  assert.equal(id, "idemp_abc123");
});

test("2. empty crypto provider fails closed", () => {
  assert.throws(() => createTimplaCashCheckoutAttemptId({}), /Secure randomness unavailable/);
});

test("3. valid tender conversions", () => {
  assert.equal(parseCashTenderedCentavos("0"), 0);
  assert.equal(parseCashTenderedCentavos("100"), 10000);
  assert.equal(parseCashTenderedCentavos("100.5"), 10050);
  assert.equal(parseCashTenderedCentavos("100.05"), 10005);
  assert.equal(parseCashTenderedCentavos("0001.05"), 105);
});

test("4. invalid tender table", () => {
  const invalid: string[] = [
    "",
    " ",
    " 100",
    "100 ",
    "-100",
    "+100",
    "1,000",
    "1e2",
    "1.5e2",
    ".50",
    "100.",
    "100.123",
    "abc",
    "100.5.5",
  ];
  for (const input of invalid) {
    assert.throws(() => parseCashTenderedCentavos(input), `expected throw for: ${input}`);
  }
});

test("5. overflow rejection", () => {
  const tooBig = String(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
  assert.throws(() => parseCashTenderedCentavos(tooBig), /exceeds safe integer range/);
});

test("6. stable retry produces identical request", () => {
  const params = buildParams();
  const a = buildOrderSnapCashCheckoutRequest(params);
  const b = buildOrderSnapCashCheckoutRequest(params);
  assert.deepEqual(a, b);
  assert.equal(a.lines[0].lineId, b.lines[0].lineId);
  assert.equal(a.idempotencyKey, params.idempotencyKey);
});

test("7. different keys produce different line IDs", () => {
  const a = buildOrderSnapCashCheckoutRequest(buildParams({ idempotencyKey: "idemp_key_one" }));
  const b = buildOrderSnapCashCheckoutRequest(buildParams({ idempotencyKey: "idemp_key_two" }));
  assert.notEqual(a.lines[0].lineId, b.lines[0].lineId);
});

test("8. GCash rejected", () => {
  assert.throws(() => buildOrderSnapCashCheckoutRequest(buildParams({ paymentMethod: "gcash" })), /Only cash/);
});

test("9. nonzero discount rejected", () => {
  assert.throws(() => buildOrderSnapCashCheckoutRequest(buildParams({ discountCentavos: 100 })), /Discounts/);
});

test("10. nonzero loyalty discount rejected", () => {
  assert.throws(() => buildOrderSnapCashCheckoutRequest(buildParams({ loyaltyDiscountCentavos: 50 })), /Loyalty/);
});

test("11. active table ID rejected", () => {
  assert.throws(() => buildOrderSnapCashCheckoutRequest(buildParams({ activeTableId: "table_1" })), /Table orders/);
});

test("12. nonempty notes rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, notes: "extra shot" }] })),
    /Notes/
  );
});

test("13. empty cart rejected", () => {
  assert.throws(() => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [] })), /empty/);
});

test("14. blank menu item ID rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, menuItemId: " " }] })),
    /Menu item ID/
  );
});

test("15. zero quantity rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, quantity: 0 }] })),
    /Quantity/
  );
});

test("16. negative quantity rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, quantity: -1 }] })),
    /Quantity/
  );
});

test("17. fractional quantity rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, quantity: 1.5 }] })),
    /Quantity/
  );
});

test("18. invalid key without prefix rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ idempotencyKey: "no_prefix" })),
    /Idempotency/
  );
});

test("19. empty-suffix key idemp_ rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ idempotencyKey: "idemp_" })),
    /Idempotency/
  );
});

test("20. valid modifiers map correctly", () => {
  const result = buildOrderSnapCashCheckoutRequest(buildParams());
  assert.deepEqual(result.lines[0].selectedModifiers, [{ groupId: "grp_syrup", optionId: "opt_vanilla" }]);
});

test("21. blank modifier group ID rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, selectedModifiers: [{ groupId: "", optionId: "opt_vanilla" }] }] })),
    /Modifier group ID/
  );
});

test("22. blank modifier option ID rejected", () => {
  assert.throws(
    () => buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, selectedModifiers: [{ groupId: "grp_syrup", optionId: " " }] }] })),
    /Modifier option ID/
  );
});

test("23. UI name and price are absent from output", () => {
  const itemWithUI = {
    ...VALID_ITEM,
    name: "Iced Latte",
    price: 13000,
    lineTotal: 13000,
  } as unknown as TimplaCashCartItem;
  const result = buildOrderSnapCashCheckoutRequest(buildParams({ cart: [itemWithUI] }));
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("Iced Latte"), "UI name must not appear in output");
  assert.ok(!serialized.includes("13000"), "UI price must not appear in output");
  const line = result.lines[0];
  const keys = Object.keys(line).sort();
  assert.deepEqual(keys, ["lineId", "menuItemId", "quantity", "selectedModifiers"]);
});

test("24. empty notes accepted", () => {
  const result = buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, notes: "" }] }));
  assert.equal(result.lines.length, 1);
});

test("25. undefined notes accepted", () => {
  const result = buildOrderSnapCashCheckoutRequest(buildParams());
  assert.equal(result.lines.length, 1);
});

test("26. whitespace-only notes accepted", () => {
  const result = buildOrderSnapCashCheckoutRequest(buildParams({ cart: [{ ...VALID_ITEM, notes: "   " }] }));
  assert.equal(result.lines.length, 1);
});