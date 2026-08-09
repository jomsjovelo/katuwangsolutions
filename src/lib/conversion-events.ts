'use client';

import { trackMetaCustomEvent, MetaEventParameters } from './meta-pixel';

export type CtaSource =
  | 'hero'
  | 'floating_bar'
  | 'business_finder'
  | 'problem_finder'
  | 'module_carousel'
  | 'pricing_section'
  | 'referral_section'
  | 'module_catalogue_card'
  | 'module_catalogue_footer'
  | 'module_page_hero'
  | 'module_page_final';

export type DiscoveryType =
  | 'business_finder'
  | 'problem_finder'
  | 'catalogue'
  | 'module_carousel';

export type RoleType = 'owner' | 'staff';

export type StageName = 'account_setup' | 'payment' | 'verification';

const VALID_CTA_SOURCES = new Set<string>([
  'hero',
  'floating_bar',
  'business_finder',
  'problem_finder',
  'module_carousel',
  'pricing_section',
  'referral_section',
  'module_catalogue_card',
  'module_catalogue_footer',
  'module_page_hero',
  'module_page_final',
]);

const VALID_DISCOVERY_TYPES = new Set<string>([
  'business_finder',
  'problem_finder',
  'catalogue',
  'module_carousel',
]);

const VALID_ROLE_TYPES = new Set<string>(['owner', 'staff']);

const VALID_STAGE_NAMES = new Set<string>([
  'account_setup',
  'payment',
  'verification',
]);

export function isValidModuleId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id);
}

export function isValidCtaSource(source: unknown): source is CtaSource {
  return typeof source === 'string' && VALID_CTA_SOURCES.has(source);
}

export function isValidDiscoveryType(type: unknown): type is DiscoveryType {
  return typeof type === 'string' && VALID_DISCOVERY_TYPES.has(type);
}

export function isValidRoleType(role: unknown): role is RoleType {
  return typeof role === 'string' && VALID_ROLE_TYPES.has(role);
}

export function isValidStageName(stage: unknown): stage is StageName {
  return typeof stage === 'string' && VALID_STAGE_NAMES.has(stage);
}

const recentEvents = new Map<string, number>();

function isDuplicate1s(eventKey: string): boolean {
  const now = Date.now();
  const lastTime = recentEvents.get(eventKey);
  if (lastTime && now - lastTime < 1000) {
    return true;
  }
  recentEvents.set(eventKey, now);
  return false;
}

export function trackModuleDiscovery(moduleId: string, discoveryType: DiscoveryType) {
  if (!isValidModuleId(moduleId) || !isValidDiscoveryType(discoveryType)) return;
  const key = `ModuleDiscovery:${moduleId}:${discoveryType}`;
  if (isDuplicate1s(key)) return;

  const payload: MetaEventParameters = {
    module_id: moduleId,
    discovery_type: discoveryType,
  };
  trackMetaCustomEvent('ModuleDiscovery', payload);
}

export function trackRegistrationIntent(ctaSource: CtaSource, moduleId?: string) {
  if (!isValidCtaSource(ctaSource)) return;
  const validModuleId = isValidModuleId(moduleId) ? moduleId : undefined;
  const key = `RegistrationIntent:${ctaSource}:${validModuleId || 'none'}`;
  if (isDuplicate1s(key)) return;

  const payload: MetaEventParameters = {
    cta_source: ctaSource,
  };
  if (validModuleId) {
    payload.module_id = validModuleId;
  }
  trackMetaCustomEvent('RegistrationIntent', payload);
}

export function trackRegistrationRoleSelected(roleType: RoleType, ctaSource?: CtaSource, moduleId?: string) {
  if (!isValidRoleType(roleType)) return;
  const validCtaSource = isValidCtaSource(ctaSource) ? ctaSource : undefined;
  const validModuleId = isValidModuleId(moduleId) ? moduleId : undefined;

  const payload: MetaEventParameters = {
    role_type: roleType,
  };
  if (validCtaSource) {
    payload.cta_source = validCtaSource;
  }
  if (validModuleId) {
    payload.module_id = validModuleId;
  }
  trackMetaCustomEvent('RegistrationRoleSelected', payload);
}

export function trackModuleSelectionConfirmed(moduleId: string, ctaSource?: CtaSource) {
  if (!isValidModuleId(moduleId)) return;
  const validCtaSource = isValidCtaSource(ctaSource) ? ctaSource : undefined;

  const payload: MetaEventParameters = {
    module_id: moduleId,
  };
  if (validCtaSource) {
    payload.cta_source = validCtaSource;
  }
  trackMetaCustomEvent('ModuleSelectionConfirmed', payload);
}

export function trackOnboardingStageView(moduleId: string, stageName: StageName, trackerSet?: Set<string>) {
  if (!isValidModuleId(moduleId) || !isValidStageName(stageName)) return;

  const key = `${moduleId}:${stageName}`;
  if (trackerSet) {
    if (trackerSet.has(key)) return;
    trackerSet.add(key);
  }

  const payload: MetaEventParameters = {
    module_id: moduleId,
    stage_name: stageName,
  };
  trackMetaCustomEvent('OnboardingStageView', payload);

  if (stageName === 'payment') {
    trackMetaCustomEvent('PaymentInstructionsView', {
      module_id: moduleId,
      stage_name: 'payment',
    });
  }
}

export function trackPaymentMessengerClick(moduleId: string) {
  if (!isValidModuleId(moduleId)) return;
  const key = `PaymentMessengerClick:${moduleId}`;
  if (isDuplicate1s(key)) return;

  const payload: MetaEventParameters = {
    module_id: moduleId,
    stage_name: 'payment',
  };
  trackMetaCustomEvent('PaymentMessengerClick', payload);
}

export function trackPaymentMarkedSent(moduleId: string, trackerSet?: Set<string>) {
  if (!isValidModuleId(moduleId)) return;

  if (trackerSet) {
    if (trackerSet.has(moduleId)) return;
    trackerSet.add(moduleId);
  }

  const payload: MetaEventParameters = {
    module_id: moduleId,
    stage_name: 'payment',
  };
  trackMetaCustomEvent('PaymentMarkedSent', payload);
}
