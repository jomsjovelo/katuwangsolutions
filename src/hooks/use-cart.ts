import { useState, useCallback } from 'react';
import { CartItem } from '@/firebase/firestore/retail-actions';
import { computeLineFinancials } from '@/lib/shared/quantity-math';

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((
    product: any,
    measuredOptions?: { quantityMinor: number; sellingUnit?: string; quantityScale?: number }
  ) => {
    const isMeasured = product.quantityMode === 'measured' || !!measuredOptions;

    if (isMeasured) {
      const minorToAdd = measuredOptions?.quantityMinor ?? 1000;
      const unit = measuredOptions?.sellingUnit || product.sellingUnit || product.unit || 'kg';
      const scale = measuredOptions?.quantityScale || product.quantityScale || 3;
      const availableMinor = product.stockQuantityMinor ?? (product.currentStock ? product.currentStock * 1000 : 0);

      setCart(prev => {
        const existing = prev.find(item => item.productId === product.id);
        if (existing) {
          const currentMinor = existing.quantityMinor ?? 1000;
          const nextMinor = currentMinor + minorToAdd;
          if (availableMinor > 0 && nextMinor > availableMinor) return prev;
          return prev.map(item => item.productId === product.id
            ? { ...item, quantityMinor: nextMinor }
            : item
          );
        }
        if (availableMinor > 0 && minorToAdd > availableMinor) return prev;
        return [...prev, {
          productId: product.id,
          name: product.name,
          price: product.salePrice,
          quantity: 1,
          costPrice: product.costPrice,
          quantityMode: 'measured',
          quantityMinor: minorToAdd,
          quantityScale: scale,
          sellingUnit: unit,
          unit
        }];
      });
    } else {
      // Discrete mode
      if (product.currentStock !== undefined && product.currentStock <= 0) return;

      setCart(prev => {
        const existing = prev.find(item => item.productId === product.id);
        if (existing) {
          if (product.currentStock !== undefined && existing.quantity >= product.currentStock) return prev;
          return prev.map(item => item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
          );
        }
        return [...prev, {
          productId: product.id,
          name: product.name,
          price: product.salePrice,
          quantity: 1,
          costPrice: product.costPrice,
          quantityMode: 'discrete',
          unit: product.unit || 'pcs'
        }];
      });
    }
  }, []);

  const updateCartItemQuantity = useCallback((
    productId: string,
    newQuantityOrMinor: number,
    mode: 'discrete' | 'measured' = 'discrete'
  ) => {
    setCart(prev => {
      if (newQuantityOrMinor <= 0) {
        return prev.filter(item => item.productId !== productId);
      }
      return prev.map(item => {
        if (item.productId !== productId) return item;
        if (mode === 'measured' || item.quantityMode === 'measured') {
          return { ...item, quantityMinor: newQuantityOrMinor };
        }
        return { ...item, quantity: newQuantityOrMinor };
      });
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing && existing.quantityMode !== 'measured' && existing.quantity > 1) {
        return prev.map(item => item.productId === productId 
          ? { ...item, quantity: item.quantity - 1 }
          : item
        );
      }
      return prev.filter(item => item.productId !== productId);
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const totalCentavos = cart.reduce((sum, item) => {
    if (item.quantityMode === 'measured' && item.quantityMinor !== undefined) {
      const line = computeLineFinancials(item.price, item.quantityMinor, item.quantityScale || 3);
      return sum + line;
    }
    return sum + (item.price * item.quantity);
  }, 0);

  const totalPesos = totalCentavos / 100;
  const cartItemCount = cart.reduce((sum, item) => {
    if (item.quantityMode === 'measured') {
      return sum + 1;
    }
    return sum + item.quantity;
  }, 0);

  return {
    cart,
    setCart,
    addToCart,
    updateCartItemQuantity,
    removeFromCart,
    clearCart,
    totalCentavos,
    totalPesos,
    cartItemCount
  };
}
