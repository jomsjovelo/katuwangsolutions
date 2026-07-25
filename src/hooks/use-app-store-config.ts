import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { getModulePricing } from '@/lib/pricing';

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
  const getAppPrice = (appId: string, _baseHardcodedPrice: number = 0) => {
    // 1. Check if there's a specific dynamic promotion override in Firestore
    if (config.promotions && typeof config.promotions[appId] === 'number') {
      const canonical = getModulePricing(appId);
      return { 
        price: config.promotions[appId], 
        isPromo: true, 
        originalPrice: canonical.regularMonthlyPrice
      };
    }
    
    // 2. Canonical pricing rule: Budget Mo = ₱50/mo (regular ₱100), all 19 other modules = ₱99/mo (regular ₱199)
    const canonical = getModulePricing(appId);
    return { 
      price: canonical.promotionalMonthlyPrice, 
      isPromo: canonical.promotional, 
      originalPrice: canonical.regularMonthlyPrice
    };
  };

  return { config, loading, error, getAppPrice };
}
