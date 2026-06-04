'use client';

import { useCollection as useFirebaseCollection } from 'react-firebase-hooks/firestore';
import { Query, DocumentData, FirestoreError } from 'firebase/firestore';
import { useMemo } from 'react';

export function useCollection<T = DocumentData>(query: Query<T> | null) {
  // Leverage the official bulletproof hook which perfectly handles referential equality
  const [snapshot, loading, error] = useFirebaseCollection(query as any);

  // Memoize the mapped data to prevent downstream re-renders
  const data = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    } as T));
  }, [snapshot]);

  return { data, loading, error: error as FirestoreError | null };
}
