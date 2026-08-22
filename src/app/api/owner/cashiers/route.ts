import { createCashiersRouteHandlers } from '@/lib/server/owner-cashier-handlers';

const defaultHandlers = createCashiersRouteHandlers();
export const GET = defaultHandlers.GET;
export const POST = defaultHandlers.POST;
