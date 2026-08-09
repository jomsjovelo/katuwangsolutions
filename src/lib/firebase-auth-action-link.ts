/**
 * Pure utility function to transform server-generated Firebase auth action links
 * into canonical Katuwang Solutions URLs: https://katuwangsolutions.com/auth/action
 *
 * Preserves all query parameters (mode, oobCode, apiKey, continueUrl, lang) intact.
 */
export function transformFirebaseAuthActionLink(firebaseLink: string): string {
  if (!firebaseLink || typeof firebaseLink !== 'string') {
    throw new Error('Invalid Firebase action link input');
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(firebaseLink);
  } catch {
    throw new Error('Malformed Firebase action link URL');
  }

  const allowedFirebaseHosts = new Set([
    'studio-5538116689-bdfb2.firebaseapp.com',
    'studio-5538116689-bdfb2.web.app',
  ]);

  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.port !== '' ||
    sourceUrl.username !== '' ||
    sourceUrl.password !== '' ||
    !allowedFirebaseHosts.has(sourceUrl.hostname) ||
    sourceUrl.pathname !== '/__/auth/action' ||
    sourceUrl.hash !== '' ||
    !sourceUrl.searchParams.get('mode') ||
    !sourceUrl.searchParams.get('oobCode')
  ) {
    throw new Error('Unexpected Firebase action link shape');
  }

  // Build destination URL using fixed official origin and pathname
  const targetUrl = new URL('https://katuwangsolutions.com/auth/action');
  targetUrl.search = sourceUrl.search;

  return targetUrl.toString();
}
