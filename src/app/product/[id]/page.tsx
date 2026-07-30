import { getActiveAppById, normalizeModuleId } from '@/lib/app-data';
import { notFound, permanentRedirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LegacyProductRedirectPage({ params, searchParams }: Props) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const id = resolvedParams.id;

  const canonicalId = normalizeModuleId(id);
  const foundApp = getActiveAppById(canonicalId);
  if (!foundApp) {
    notFound();
  }

  const urlParams = new URLSearchParams();
  Object.entries(resolvedSearchParams).forEach(([key, val]) => {
    if (typeof val === 'string') {
      urlParams.set(key, val);
    } else if (Array.isArray(val)) {
      val.forEach(v => urlParams.append(key, v));
    }
  });
  const queryString = urlParams.toString();
  const dest = `/${canonicalId}${queryString ? `?${queryString}` : ''}`;
  
  permanentRedirect(dest);
}
