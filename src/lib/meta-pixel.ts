export const FB_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}

/**
 * Fire Meta Pixel PageView event
 */
export const pageview = () => {
  if (typeof window !== 'undefined' && window.fbq && FB_PIXEL_ID) {
    window.fbq('track', 'PageView');
  }
};

/**
 * Fire standard Meta Pixel event with custom parameters
 */
export const event = (name: string, options = {}) => {
  if (typeof window !== 'undefined' && window.fbq && FB_PIXEL_ID) {
    window.fbq('track', name, options);
  }
};

/**
 * Fire ViewContent event when viewing a dedicated module landing page
 */
export const trackViewContent = (data: {
  moduleId: string;
  moduleName: string;
  category?: string;
  price?: number;
}) => {
  event('ViewContent', {
    content_name: data.moduleName,
    content_category: data.category || 'Module',
    content_ids: [data.moduleId],
    content_type: 'product',
    value: data.price || (data.moduleId === 'budget-mo' ? 50 : 99),
    currency: 'PHP',
  });
};

/**
 * Fire Lead / StartOnboarding event when user begins module onboarding
 */
export const trackStartOnboarding = (data: {
  moduleId: string;
  moduleName: string;
  category?: string;
  price?: number;
}) => {
  event('Lead', {
    content_name: data.moduleName,
    content_category: data.category || 'Module',
    content_ids: [data.moduleId],
    value: data.price || (data.moduleId === 'budget-mo' ? 50 : 99),
    currency: 'PHP',
  });
};

/**
 * Fire CompleteRegistration event ONLY after Firebase user auth and tenant creation succeed
 */
export const trackCompleteRegistration = (data: {
  moduleId: string;
  moduleName?: string;
  pricingTier?: string;
  value?: number;
}) => {
  event('CompleteRegistration', {
    content_name: data.moduleName || data.moduleId,
    content_ids: [data.moduleId],
    status: 'pending_verification',
    value: data.value || (data.moduleId === 'budget-mo' ? 50 : 99),
    currency: 'PHP',
  });
};
