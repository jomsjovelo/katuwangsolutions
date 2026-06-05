import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { amount, description, type } = await req.json();

    const apiKey = process.env.PAYMONGO_SECRET_KEY;
    
    // Fallback to mock for testing if no API key is provided
    if (!apiKey) {
      console.warn("No PAYMONGO_SECRET_KEY found. Returning mock payment link.");
      return NextResponse.json({
        checkoutUrl: `https://mock-payment.com/checkout?amount=${amount}&type=${type}`,
        qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=mock-payment-url-for-${type}`
      });
    }

    // Call PayMongo API to create a payment link
    const response = await fetch('https://api.paymongo.com/v1/links', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(amount * 100), // Convert to cents
            description: description || 'Katuwang Payment',
            remarks: type // e.g. 'gcash' or 'maya'
          }
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`PayMongo API error: ${err}`);
    }

    const data = await response.json();
    const checkoutUrl = data.data.attributes.checkout_url;

    // Generate a QR code for the checkout URL so the customer can scan it
    return NextResponse.json({
      checkoutUrl,
      qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(checkoutUrl)}`
    });

  } catch (error: any) {
    console.error('Payment generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate payment link.' },
      { status: 500 }
    );
  }
}
