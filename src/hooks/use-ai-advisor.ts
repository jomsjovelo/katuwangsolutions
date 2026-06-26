'use client';

import { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { useInventory } from '@/hooks/use-inventory';
import { useSales } from '@/hooks/use-sales';

export interface AIAdvice {
  advice: string;
  keyAlerts: string[];
  actionSteps: string[];
}

export function useAIAdvisor() {
  const { currentTenant } = useTenant();
  const { products, lowStockItems, outOfStockItems, loading: inventoryLoading } = useInventory();
  const { sales, dailyTotalPesos, loading: salesLoading } = useSales(new Date());

  const [advice, setAdvice] = useState<string | null>(null);
  const [keyAlerts, setKeyAlerts] = useState<string[]>([]);
  const [actionSteps, setActionSteps] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cached advice from localStorage to prevent repetitive calls upon page loads
  useEffect(() => {
    if (currentTenant) {
      setError(null);
      const cached = localStorage.getItem(`katuwang_ai_cache_${currentTenant.id}`);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setAdvice(parsed.advice);
          setKeyAlerts(parsed.keyAlerts || []);
          setActionSteps(parsed.actionSteps || []);
        } catch (e) {
          console.warn("Failed parsing cached Katuwang AI advice:", e);
        }
      } else {
        // Reset states if no cache exists
        setAdvice(null);
        setKeyAlerts([]);
        setActionSteps([]);
      }
    }
  }, [currentTenant?.id]);

  const askAdvisor = async (forceRefresh = false) => {
    if (!currentTenant) return;
    
    // Check local caching
    if (!forceRefresh) {
      const cached = localStorage.getItem(`katuwang_ai_cache_${currentTenant.id}`);
      if (cached) return; // Use existing cache
    }

    // Check online status first for wet market stability
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError("Ate/Kuya, offline po kayo ngayon. Ang Katuwang AI ay nangangailangan ng internet para makapag-isip. Pakisubukang muli kapag may signal na po.");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Structure request payload according to AdvisorInputSchema
      const payload = {
        tenantName: currentTenant.name,
        moduleType: currentTenant.moduleType,
        products: products.map(p => ({
          name: p.name,
          category: p.category || 'General',
          currentStock: p.currentStock || 0,
          minStock: p.minStock || 10,
          salePrice: p.salePrice || 0,
          unit: p.unit || 'pcs'
        })),
        sales: sales.map((s: any) => ({
          totalAmount: s.totalAmount || 0,
          paymentMethod: s.paymentMethod || 'cash',
          items: (s.items || []).map((i: any) => ({
            name: i.name,
            quantity: i.quantity || 1,
            price: i.price || 0
          }))
        })),
        lowStockItems: lowStockItems.map(p => ({
          name: p.name,
          category: p.category || 'General',
          currentStock: p.currentStock || 0,
          minStock: p.minStock || 10,
          salePrice: p.salePrice || 0,
          unit: p.unit || 'pcs'
        })),
        outOfStockItems: outOfStockItems.map(p => ({
          name: p.name,
          category: p.category || 'General',
          currentStock: p.currentStock || 0,
          minStock: p.minStock || 10,
          salePrice: p.salePrice || 0,
          unit: p.unit || 'pcs'
        })),
        dailyTotalPesos: dailyTotalPesos || 0,
      };

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "May error sa pagtawag kay Katuwang AI.");
      }

      const data: AIAdvice = await response.json();
      
      setAdvice(data.advice);
      setKeyAlerts(data.keyAlerts || []);
      setActionSteps(data.actionSteps || []);

      // Cache the result
      localStorage.setItem(`katuwang_ai_cache_${currentTenant.id}`, JSON.stringify(data));
    } catch (e: any) {
      console.error("useAIAdvisor Error:", e);
      setError(e.message || "Hindi po makakonekta kay Katuwang AI ngayon. Pakisubukan po ulit mamaya.");
    } finally {
      setIsLoading(false);
    }
  };

  const clearCache = () => {
    if (currentTenant) {
      localStorage.removeItem(`katuwang_ai_cache_${currentTenant.id}`);
      setAdvice(null);
      setKeyAlerts([]);
      setActionSteps([]);
    }
  };

  return {
    advice,
    keyAlerts,
    actionSteps,
    isLoading: isLoading || inventoryLoading || salesLoading,
    error,
    askAdvisor,
    clearCache
  };
}
