import { useState, useEffect } from 'react';
import { DocumentReference, onSnapshot, DocumentData } from 'firebase/firestore';

export function useFirestoreDocument<T = DocumentData>(
  ref: DocumentReference | null,
  options?: {
    onData?: (data: T) => void;
    onError?: (error: Error) => void;
  }
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ref) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          const docData = { id: snapshot.id, ...snapshot.data() } as unknown as T;
          setData(docData);
          if (options?.onData) {
            options.onData(docData);
          }
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error(`Error subscribing to ${ref.path}:`, err);
        setError(err);
        if (options?.onError) {
          options.onError(err);
        }
        setLoading(false);
      }
    );

    // Cleanup strictly on unmount or ref change
    return () => unsubscribe();
  }, [ref?.path]); // Depend on path string to avoid object reference equality issues

  return { data, loading, error };
}
