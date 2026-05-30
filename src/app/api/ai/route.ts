import { NextResponse } from 'next/server';
import { advisorFlow } from '@/ai/flows/advisor';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY is not defined in environment variables.");
      return NextResponse.json(
        { error: "Hindi ma-access ang AI service. Mangyaring i-setup ang GEMINI_API_KEY sa .env file o App Hosting settings." },
        { status: 500 }
      );
    }

    // Call the Genkit flow directly
    // @ts-ignore - Genkit 1.28 Action type expects 3 arguments in some TS versions
    const result = await advisorFlow(body);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Katuwang AI Route Error:", error);
    return NextResponse.json(
      { error: error.message || "Nagkaroon ng problema sa pagproseso ng inyong AI request." },
      { status: 500 }
    );
  }
}
