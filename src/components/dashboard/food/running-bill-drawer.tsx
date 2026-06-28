"use client"

import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Receipt, RotateCcw, Coins } from "lucide-react";
import { GCashQrModal } from '@/components/common/gcash-qr-modal';

interface RunningBillDrawerProps {
  open: boolean;
  onClose: () => void;
  table: any | null;
  orders: any[]; // The live food_orders associated with this table
  onAddItems: () => void; // Triggered to open the POS for this table
  onSettle: (paymentMethod: string, gcashRef?: string) => Promise<void>;
  onReset: () => Promise<void>;
  theme: any;
  tenantName: string;
}

export function RunningBillDrawer({ 
  open, 
  onClose, 
  table, 
  orders, 
  onAddItems,
  onSettle,
  onReset,
  theme,
  tenantName
}: RunningBillDrawerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showGCashQr, setShowGCashQr] = useState(false);

  if (!table) return null;

  const runningTotal = table.runningTotal || 0;

  const handleSettleCash = async () => {
    setIsProcessing(true);
    try {
      await onSettle('cash');
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Sigurado ka bang gusto mong i-reset ang table na ito at i-void ang mga current orders?")) return;
    setIsProcessing(true);
    try {
      await onReset();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col h-full bg-slate-50 overflow-hidden p-0">
          <div className="p-6 pb-4 border-b bg-white">
            <SheetHeader>
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-xl font-black">{table.name}</SheetTitle>
                  <SheetDescription>Running Bill • {table.guestCount} Guests</SheetDescription>
                </div>
                <div 
                  className="px-3 py-1 rounded-full text-white font-bold text-xs"
                  style={{ backgroundColor: theme.primary }}
                >
                  ₱{(runningTotal / 100).toLocaleString()}
                </div>
              </div>
            </SheetHeader>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {orders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p>No active orders.</p>
              </div>
            ) : (
              orders.map((order, idx) => (
                <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-bold text-sm text-slate-500 uppercase">Order {idx + 1}</span>
                    <span className="text-[10px] bg-slate-100 px-2 py-1 rounded-md font-bold text-slate-600">
                      {order.status}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {order.items?.map((item: any, i: number) => (
                      <li key={i} className="text-sm flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800">{item.quantity}x</span>{' '}
                          <span className="text-slate-600">{item.name}</span>
                        </div>
                        <span className="font-bold">₱{((item.price * item.quantity) / 100).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t bg-white space-y-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            <div className="flex justify-between items-center mb-2 px-2">
              <span className="font-black text-slate-500">TOTAL</span>
              <span className="text-2xl font-black text-slate-800">₱{(runningTotal / 100).toLocaleString()}</span>
            </div>
            
            <Button 
              className="w-full h-12 font-bold" 
              variant="outline"
              onClick={onAddItems}
              disabled={isProcessing}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add More Items
            </Button>
            
            <div className="grid grid-cols-2 gap-3">
              <Button 
                className="w-full h-12 font-bold"
                style={{ backgroundColor: theme.primary }}
                onClick={handleSettleCash}
                disabled={isProcessing || runningTotal === 0}
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Coins className="h-4 w-4 mr-2" />}
                Cash
              </Button>
              <Button 
                className="w-full h-12 font-bold bg-[#007DFE] hover:bg-[#005bb5] text-white"
                onClick={() => setShowGCashQr(true)}
                disabled={isProcessing || runningTotal === 0}
              >
                GCash
              </Button>
            </div>
            
            <div className="pt-4 flex justify-center">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-red-400 hover:text-red-600 hover:bg-red-50 text-xs"
                onClick={handleReset}
                disabled={isProcessing}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset & Void Table
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* GCash Modal */}
      <GCashQrModal
        open={showGCashQr}
        onClose={() => setShowGCashQr(false)}
        totalAmount={runningTotal}
        tenantName={tenantName}
        paymentType="gcash"
        theme={theme}
        onPaymentVerified={async (method, ref) => {
          setShowGCashQr(false);
          setIsProcessing(true);
          try {
            await onSettle(method, ref);
            onClose();
          } catch (e) {
            console.error(e);
          } finally {
            setIsProcessing(false);
          }
        }}
      />
    </>
  );
}
