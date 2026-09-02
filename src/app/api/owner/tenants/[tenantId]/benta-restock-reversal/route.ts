import { createRestockReversalRouteHandler } from '@/lib/server/benta-restock-reversal';

const handler = createRestockReversalRouteHandler();

export const POST = handler;
