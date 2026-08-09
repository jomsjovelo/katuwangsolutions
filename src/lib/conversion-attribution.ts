'use client';

import { CtaSource, isValidCtaSource } from './conversion-events';

export interface TenantAcquisitionData {
  landingPath?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  ctaSource?: CtaSource;
}

const STORAGE_KEY = 'katuwang_acquisition_v1';

export function sanitizeUtmValue(val: string | null | undefined): string | undefined {
  if (!val || typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > 100) return undefined;
  if (
    trimmed.includes('@') ||
    trimmed.includes('://') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    /[\x00-\x1F\x7F]/.test(trimmed) ||
    /[^a-zA-Z0-9 _.-]/.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

export function validateLandingPath(path: string | null | undefined): string | undefined {
  if (!path || typeof path !== 'string') return undefined;
  if (
    !path.startsWith('/') ||
    path.length > 120 ||
    path.includes('://') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('@') ||
    path.includes('\\') ||
    /[\x00-\x1F\x7F]/.test(path)
  ) {
    return undefined;
  }
  return path;
}

export function captureFirstTouchAcquisition(urlParams: URLSearchParams, pathname: string) {
  if (typeof window === 'undefined') return;

  try {
    const existingRaw = sessionStorage.getItem(STORAGE_KEY);
    let existing: any = existingRaw ? JSON.parse(existingRaw) : {};

    const landingPath = validateLandingPath(pathname);
    const utmSource = sanitizeUtmValue(urlParams.get('utm_source'));
    const utmMedium = sanitizeUtmValue(urlParams.get('utm_medium'));
    const utmCampaign = sanitizeUtmValue(urlParams.get('utm_campaign'));
    const utmContent = sanitizeUtmValue(urlParams.get('utm_content'));

    const updated: TenantAcquisitionData = {};

    const finalLandingPath = validateLandingPath(existing.landingPath) || landingPath;
    if (finalLandingPath) updated.landingPath = finalLandingPath;

    const finalUtmSource = sanitizeUtmValue(existing.utmSource) || utmSource;
    if (finalUtmSource) updated.utmSource = finalUtmSource;

    const finalUtmMedium = sanitizeUtmValue(existing.utmMedium) || utmMedium;
    if (finalUtmMedium) updated.utmMedium = finalUtmMedium;

    const finalUtmCampaign = sanitizeUtmValue(existing.utmCampaign) || utmCampaign;
    if (finalUtmCampaign) updated.utmCampaign = finalUtmCampaign;

    const finalUtmContent = sanitizeUtmValue(existing.utmContent) || utmContent;
    if (finalUtmContent) updated.utmContent = finalUtmContent;

    if (isValidCtaSource(existing.ctaSource)) {
      updated.ctaSource = existing.ctaSource;
    }

    if (Object.keys(updated).length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  } catch (err) {
    // Fail silently without breaking page render
  }
}

export function updateAcquisitionCtaSource(ctaSource: CtaSource) {
  if (typeof window === 'undefined') return;
  if (!isValidCtaSource(ctaSource)) return;

  try {
    const existingRaw = sessionStorage.getItem(STORAGE_KEY);
    let existing: any = existingRaw ? JSON.parse(existingRaw) : {};

    const updated: TenantAcquisitionData = {};
    const landingPath = validateLandingPath(existing.landingPath);
    if (landingPath) updated.landingPath = landingPath;

    const utmSource = sanitizeUtmValue(existing.utmSource);
    if (utmSource) updated.utmSource = utmSource;

    const utmMedium = sanitizeUtmValue(existing.utmMedium);
    if (utmMedium) updated.utmMedium = utmMedium;

    const utmCampaign = sanitizeUtmValue(existing.utmCampaign);
    if (utmCampaign) updated.utmCampaign = utmCampaign;

    const utmContent = sanitizeUtmValue(existing.utmContent);
    if (utmContent) updated.utmContent = utmContent;

    updated.ctaSource = ctaSource;

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    // Fail silently
  }
}

export function getStoredAcquisitionSnapshot(): TenantAcquisitionData | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const existingRaw = sessionStorage.getItem(STORAGE_KEY);
    if (!existingRaw) return undefined;

    const data: any = JSON.parse(existingRaw);
    if (!data || typeof data !== 'object') return undefined;

    const clean: TenantAcquisitionData = {};

    const landingPath = validateLandingPath(data.landingPath);
    if (landingPath) clean.landingPath = landingPath;

    const utmSource = sanitizeUtmValue(data.utmSource);
    if (utmSource) clean.utmSource = utmSource;

    const utmMedium = sanitizeUtmValue(data.utmMedium);
    if (utmMedium) clean.utmMedium = utmMedium;

    const utmCampaign = sanitizeUtmValue(data.utmCampaign);
    if (utmCampaign) clean.utmCampaign = utmCampaign;

    const utmContent = sanitizeUtmValue(data.utmContent);
    if (utmContent) clean.utmContent = utmContent;

    if (isValidCtaSource(data.ctaSource)) {
      clean.ctaSource = data.ctaSource;
    }

    return Object.keys(clean).length > 0 ? clean : undefined;
  } catch (err) {
    return undefined;
  }
}
