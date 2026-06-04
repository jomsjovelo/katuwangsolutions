import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';

export interface AppStoreConfig {
  defaultAppPrice: number;
  promotions: Record<string, number>;
  globalDiscount?: number;
}

const DEFAULT_CONFIG: AppStoreConfig = {
  defaultAppPrice: 99,
  promotions: {}
};

export function useAppStoreConfig() {
  const db = useFirestore();
  const [config, setConfig] = useState<AppStoreConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!db) return;

    const docRef = doc(db, 'system', 'appStoreConfig');
    
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setConfig({ ...DEFAULT_CONFIG, ...snapshot.data() } as AppStoreConfig);
        } else {
          // Fallback to default if document doesn't exist yet
          setConfig(DEFAULT_CONFIG);
        }
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching appStoreConfig:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db]);

  // Helper to calculate the final price for a specific app
  const getAppPrice = (appId: string, baseHardcodedPrice: number = 0) => {
    // 1. Check if there's a specific promotion for this app
    if (config.promotions && typeof config.promotions[appId] === 'number') {
      return { 
        price: config.promotions[appId], 
        isPromo: true, 
        originalPrice: config.defaultAppPrice 
      };
    }
    
    // 2. Otherwise return the global default price
    return { 
      price: config.defaultAppPrice, 
      isPromo: false, 
      originalPrice: config.defaultAppPrice 
    };
  };

  return { config, loading, error, getAppPrice };
}
