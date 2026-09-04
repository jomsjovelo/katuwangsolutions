import { appGroups } from './app-data';

export interface MarketplaceApp {
  id: string;
  name: string;
  category: string;
  desc: string;
  price: number;
}

const FEATURED_ORDER = ['budget-mo', 'benta-snap', '5-6-tracker'];

/**
 * The in-app marketplace is derived from the same canonical catalog used by
 * the public module pages. This prevents live and localhost catalogs drifting.
 */
export const marketplaceApps: MarketplaceApp[] = appGroups
  .flatMap((group) => group.apps.map((app) => ({
    id: app.id,
    name: app.name,
    category: group.label,
    desc: app.description,
    price: app.id === 'budget-mo' ? 100 : 199,
  })))
  .sort((left, right) => {
    const leftPriority = FEATURED_ORDER.indexOf(left.id);
    const rightPriority = FEATURED_ORDER.indexOf(right.id);
    if (leftPriority >= 0 || rightPriority >= 0) {
      if (leftPriority < 0) return 1;
      if (rightPriority < 0) return -1;
      return leftPriority - rightPriority;
    }
    return 0;
  });
