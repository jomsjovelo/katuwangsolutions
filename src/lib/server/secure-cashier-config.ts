/** Single coordinated activation contract for every Secure Cashier entry point. */
export function isSecureCashierSystemEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BENTA_CASHIER_CHECKOUT_ENABLED === 'true';
}

/**
 * IP-specific throttling remains explicitly off until the trusted App Hosting
 * forwarding topology has been independently established.
 */
export function isCashierIpThrottleEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BENTA_CASHIER_IP_THROTTLE_ENABLED === 'true';
}

/**
 * Offline-first Benta Cashier feature flag (Phase 1 disabled by default).
 */
export function isSecureCashierOfflineEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BENTA_CASHIER_OFFLINE_ENABLED === 'true';
}

/**
 * B-Hybrid Cashier feature flag (disabled by default in production; enabled in isolated local emulator only).
 */
export function isBentaHybridCashierEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BENTA_CASHIER_HYBRID_ENABLED === 'true';
}
