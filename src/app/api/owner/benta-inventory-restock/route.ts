import { createBentaInventoryRestockRouteHandler } from '@/lib/server/benta-inventory-restock';

const handler = createBentaInventoryRestockRouteHandler();

export const POST = handler;
