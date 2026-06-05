import { NextResponse } from 'next/server';

/**
 * PayMongo Payment API Route
 * Supports: gcash, paymaya (Maya)
 * 
 * Flow:
 *  1. Create a PaymentIntent for the amount
 *  2. Create a PaymentMethod Source (gcash or paymaya)
 *  3. Attach the Source to the PaymentIntent -> get redirect/checkout URL
 *  4. Generate a QR from the checkout URL for the cashier to show customer
 * 
 * Docs: https://developers.paymongo.com/docs/accepting-e-wallet-payments
 */

const PAYMONGO_API = 'https://api.paymongo.com/v1';

function getAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(apiKey + ':').toString('base64')}`;
}

// Map our internal type labels to PayMongo source types
const PAYMENT_TYPE_MAP: Record<string, string> = {
  gcash: 'gcash',
  maya: 'paymaya',
  paymaya: 'paymaya',
};

export async function POST(req: Request) {
  try {
    const { amount, description, type } = await req.json();

    const apiKey = process.env.PAYMONGO_SECRET_KEY;

    // -------------------------------------------------------
    // Fallback mock for development/testing without API key
    // -------------------------------------------------------
    if (!apiKey) {
      console.warn('[Payments] No PAYMONGO_SECRET_KEY found. Returning mock link.');
      const mockLabel = type === 'maya' ? 'Maya' : 'GCash';
      return NextResponse.json({
        checkoutUrl: `https://mock-payment.com/checkout?amount=${amount}&type=${type}`,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=MOCK-${mockLabel.toUpperCase()}-${amount}`,
        paymentType: type,
        isMock: true,
      });
    }

    const paymongoType = PAYMENT_TYPE_MAP[type] || 'gcash';
    const amountCentavos = Math.round(amount * 100); // PayMongo expects centavos
    const auth = getAuthHeader(apiKey);

    // -------------------------------------------------------
    // Step 1: Create a PaymentIntent
    // -------------------------------------------------------
    const intentRes = await fetch(`${PAYMONGO_API}/payment_intents`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountCentavos,
            payment_method_allowed: [paymongoType],
            payment_method_options: {
              [paymongoType]: { redirect: { success: 'https://katuwangsolutions.com', failed: 'https://katuwangsolutions.com' } }
            },
            currency: 'PHP',
            capture_type: 'automatic',
            description: description || 'Katuwang POS Payment',
          },
        },
      }),
    });

    if (!intentRes.ok) {
      const err = await intentRes.json();
      throw new Error(`PayMongo PaymentIntent error: ${JSON.stringify(err.errors)}`);
    }

    const intentData = await intentRes.json();
    const intentId = intentData.data.id;
    const intentClientKey = intentData.data.attributes.client_key;

    // -------------------------------------------------------
    // Step 2: Create a Payment Source for the wallet type
    // -------------------------------------------------------
    const sourceRes = await fetch(`${PAYMONGO_API}/sources`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: amountCentavos,
            currency: 'PHP',
            type: paymongoType,
            redirect: {
              success: 'https://katuwangsolutions.com/payment-success',
              failed: 'https://katuwangsolutions.com/payment-failed',
            },
            billing: {
              name: 'Katuwang Customer',
            },
          },
        },
      }),
    });

    if (!sourceRes.ok) {
      const err = await sourceRes.json();
      throw new Error(`PayMongo Source creation error: ${JSON.stringify(err.errors)}`);
    }

    const sourceData = await sourceRes.json();
    const checkoutUrl = sourceData.data.attributes.redirect.checkout_url;

    if (!checkoutUrl) {
      throw new Error('PayMongo did not return a checkout_url for this payment source.');
    }

    // -------------------------------------------------------
    // Step 3: Return checkout URL + QR code image URL
    // -------------------------------------------------------
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(checkoutUrl)}`;

    return NextResponse.json({
      checkoutUrl,
      qrUrl,
      paymentType: type,
      intentId,
      intentClientKey,
      isMock: false,
    });

  } catch (error: any) {
    console.error('[Payments] Generation error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to generate payment link.' },
      { status: 500 }
    );
  }
}
