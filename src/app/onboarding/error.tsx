'use client';
import { useEffect } from 'react';

export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error("Onboarding Error Boundary caught:", error);
  }, [error]);

  return (
    <div className="p-10 flex flex-col items-center justify-center min-h-screen bg-red-50 text-red-900">
      <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
      <pre className="bg-red-100 p-4 rounded text-sm overflow-auto max-w-2xl w-full border border-red-200 whitespace-pre-wrap break-all">
        {error.message}
        <br/><br/>
        {error.stack}
      </pre>
      <button 
        onClick={() => reset()} 
        className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-bold active:scale-95"
      >
        Try again
      </button>
    </div>
  );
}
