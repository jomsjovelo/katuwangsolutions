import { createWithdrawalDecisionRoute } from '@/lib/server/command-center-withdrawals';

const handler = createWithdrawalDecisionRoute();

export async function POST(
  request: Request,
  context: { params: Promise<{ withdrawalId: string }> },
) {
  const { withdrawalId } = await context.params;
  return handler(request, withdrawalId);
}
