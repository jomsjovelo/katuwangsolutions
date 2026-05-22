import { useState, useCallback } from 'react';
import { CartItem } from '@/firebase/firestore/retail-actions';

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((product: any) => {
    if (product.currentStock <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        // Don't allow adding more than current stock
        if (existing.quantity >= product.currentStock) return prev;
        return prev.map(item => item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
        );
      }
      return [...prev, { productId: product.id, name: product.name, price: product.salePrice, quantity: 1, costPrice: product.costPrice }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing && existing.quantity > 1) {
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

  const totalCentavos = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalPesos = totalCentavos / 100;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    setCart,
    addToCart,
    removeFromCart,
    clearCart,
    totalCentavos,
    totalPesos,
    cartItemCount
  };
}
