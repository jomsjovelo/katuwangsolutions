import { redirect } from 'next/navigation';

type LegacyAuthActionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LegacyAuthActionPage({ searchParams }: LegacyAuthActionPageProps) {
  const sourceParams = await searchParams;
  const canonicalParams = new URLSearchParams();

  for (const [key, value] of Object.entries(sourceParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => canonicalParams.append(key, entry));
    } else if (typeof value === 'string') {
      canonicalParams.append(key, value);
    }
  }

  const query = canonicalParams.toString();
  redirect(query ? `/auth/action?${query}` : '/auth/action');
}
