export type PricingTier = 'promo_50' | 'promo_99';

export type ModulePricing = {
  promotionalMonthlyPrice: number;
  regularMonthlyPrice: number;
  currency: 'PHP';
  billingUnit: 'module';
  promotional: boolean;
  pricingTier: PricingTier;
};

export function getModulePricing(moduleId: string): ModulePricing {
  if (moduleId === 'budget-mo') {
    return {
      promotionalMonthlyPrice: 50,
      regularMonthlyPrice: 100,
      currency: 'PHP',
      billingUnit: 'module',
      promotional: true,
      pricingTier: 'promo_50',
    };
  }
  return {
    promotionalMonthlyPrice: 99,
    regularMonthlyPrice: 199,
    currency: 'PHP',
    billingUnit: 'module',
    promotional: true,
    pricingTier: 'promo_99',
  };
}

export function formatPeso(amount: number): string {
  return `₱${amount.toString()}`;
}

export function formatPesoWithCents(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}

export function getPromotionalPriceLabel(moduleId: string): string {
  const pricing = getModulePricing(moduleId);
  return `${formatPeso(pricing.promotionalMonthlyPrice)}/buwan`;
}

export function getRegularPriceLabel(moduleId: string): string {
  const pricing = getModulePricing(moduleId);
  return `regular ${formatPeso(pricing.regularMonthlyPrice)}`;
}
