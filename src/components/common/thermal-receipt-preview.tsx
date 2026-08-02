"use client"

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { 
  X, 
  Printer, 
  Bluetooth, 
  CheckCircle, 
  AlertCircle,
  FileText,
  Loader2,
  Image,
  Download,
  Edit3
} from "lucide-react";
import { EscPosBluetoothDriver } from '@/lib/hardware/print-driver';
import { toJpeg } from 'html-to-image';

interface ReceiptItem {
  productId?: string;
  name: string;
  quantity: number;
  price: number;
}

interface ModuleTheme {
  primary: string;
}

interface ThermalReceiptPreviewProps {
  open: boolean;
  onClose: () => void;
  storeName: string;
  receiptType?: string; // e.g., 'KITCHEN SLIP', 'RENTAL', 'BENTA'
  items: ReceiptItem[];
  subtotalAmountPesos?: number;
  discountAmountPesos?: number;
  discountType?: string;
  discountReason?: string;
  totalAmountPesos: number;
  cashReceivedPesos?: number;
  changePesos?: number;
  theme?: ModuleTheme;
  pointsEarned?: number;
  transactionId?: string;
  paymentMethod?: string;
  onVoidSale?: () => void;
  isVoiding?: boolean;
  onEditSale?: () => void;
}

export function ThermalReceiptPreview({
  open,
  onClose,
  storeName,
  items,
  subtotalAmountPesos,
  discountAmountPesos,
  discountType,
  discountReason,
  totalAmountPesos,
  transactionId,
  theme,
  pointsEarned,
  paymentMethod = 'cash',
  receiptType = "KATUWANG POS RESIBO",
  onVoidSale,
  isVoiding = false,
  onEditSale
}: ThermalReceiptPreviewProps) {
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [btSuccess, setBtSuccess] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const dateStr = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });

  // Web Bluetooth ESC/POS Printing Flow
  const handleBluetoothPrint = async () => {
    try {
      setIsPrintingBt(true);
      setBtError(null);
      setBtSuccess(false);

      const driver = new EscPosBluetoothDriver();
      const connected = await driver.connect();

      if (connected) {
        const bytes = driver.formatReceipt(
          storeName,
          items,
          totalAmountPesos,
          paymentMethod,
          transactionId
        );
        await driver.print(bytes);
        setBtSuccess(true);
        setTimeout(() => setBtSuccess(false), 3000);
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      console.error(err);
      setBtError(err.message || "Failed to connect to Bluetooth printer.");
    } finally {
      setIsPrintingBt(false);
    }
  };

  // System Print Flow (PDF or local printer)
  const handleSystemPrint = () => {
    window.print();
  };

  // Uses browser native print dialog — user can Save as PDF/Image from there
  const handleDownloadImage = async () => {
    const receiptElement = document.getElementById('katuwang-print-area');
    if (!receiptElement) return;
    
    try {
      const dataUrl = await toJpeg(receiptElement, { 
        quality: 0.95, 
        backgroundColor: '#ffffff',
        skipFonts: true 
      });
      const link = document.createElement('a');
      link.download = `Receipt_${transactionId || Date.now()}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate JPG', err);
      alert('Failed to save receipt as JPG.');
    }
  };

  const itemsSubtotalPesos = items.reduce((sum, item) => sum + ((item.price * item.quantity) / 100), 0);
  const displaySubtotalPesos = subtotalAmountPesos || itemsSubtotalPesos;

  const explicitDiscountPesos = discountAmountPesos && discountAmountPesos > 0 ? discountAmountPesos : 0;
  const inferredDiscountPesos = (!discountAmountPesos && itemsSubtotalPesos > totalAmountPesos + 0.01) 
    ? itemsSubtotalPesos - totalAmountPesos 
    : 0;
  const activeDiscountPesos = explicitDiscountPesos || inferredDiscountPesos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      
      {/* CSS print utility overlay injecting narrow-receipt print layouts dynamically */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #katuwang-print-area, #katuwang-print-area * {
            visibility: visible;
          }
          #katuwang-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 58mm;
            padding: 0;
            margin: 0;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-slate-900 w-full max-w-sm rounded-[32px] overflow-hidden border border-slate-800 shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-8 duration-300">
        
        {/* Header (No-Print) */}
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80 no-print">
          <div className="flex items-center gap-2">
            <div 
              className="h-8 w-8 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: theme?.primary || '#000' }}
            >
              <Printer className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-headline font-black text-xs uppercase tracking-widest text-slate-100">Resibo Preview</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">58mm Thermal Printer Format</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="h-8 w-8 rounded-full hover:bg-slate-800 cursor-pointer text-slate-400"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Realistic Virtual 58mm Scroll of Receipt Paper */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center items-start min-h-[350px]">
          
          <div 
            ref={receiptRef}
            id="katuwang-print-area"
            className="bg-white text-slate-800 max-w-[260px] w-full p-4 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)] font-mono text-[10px] leading-relaxed relative border-t border-slate-200"
          >
            {/* 3D Roll top slot shade effect */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-b from-slate-200 to-transparent pointer-events-none no-print" />
            
            {/* Receipt Header */}
            <div className="text-center space-y-1 mb-4">
              <h4 className="font-sans font-black text-xs uppercase text-slate-900 leading-tight">
                {storeName}
              </h4>
              <p className="text-[8px] font-bold text-slate-400 leading-none">{receiptType}</p>
              <p className="text-[7px] text-slate-400 leading-normal font-sans font-bold">Ang Katuwang mo sa Negosyo</p>
              <div className="text-slate-300 tracking-tighter text-[9px]">--------------------------------</div>
            </div>

            {/* Receipt Details */}
            <div className="space-y-1 mb-4 text-[9px] text-slate-600">
              <div>Petsa: <span className="text-slate-800 font-bold">{dateStr}</span></div>
              {transactionId && (
                <div className="truncate">Ref: <span className="text-slate-800 font-bold uppercase">{transactionId.slice(0, 10)}</span></div>
              )}
              <div>Bayad: <span className="text-slate-800 font-bold uppercase">{paymentMethod}</span></div>
              <div className="text-slate-300 tracking-tighter text-[9px] text-center">--------------------------------</div>
            </div>

            {/* Items Table List */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between font-bold text-slate-900 border-b border-dashed border-slate-200 pb-1 text-[9px]">
                <span>MGA ITEM</span>
                <span>HALAGA</span>
              </div>
              
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={item.productId || idx} className="space-y-0.5">
                    <div className="text-slate-800 font-bold truncate">{item.name}</div>
                    <div className="flex justify-between text-slate-500 text-[9px] pl-2">
                      <span>{item.quantity} x ₱{(item.price / 100).toFixed(0)}</span>
                      <span className="font-bold text-slate-700">₱{((item.price * item.quantity) / 100).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-slate-300 tracking-tighter text-[9px] text-center">--------------------------------</div>
            </div>

            {/* Loyalty Points Earned */}
            {pointsEarned && pointsEarned > 0 ? (
              <div className="mb-4 text-center border-t border-b border-dashed border-slate-200 py-1.5">
                <span className="font-bold text-slate-800 text-[9px]">
                  ⭐ Katuwang Rewards: +{pointsEarned} pts
                </span>
              </div>
            ) : null}

            {/* Financial Breakdown: Subtotal, Discount & Net Total Amount */}
            <div className="space-y-1 mb-4 text-right">
              {activeDiscountPesos > 0 && (
                <>
                  <div className="flex justify-between items-center text-[9px] text-slate-500">
                    <span className="font-sans font-bold">SUBTOTAL:</span>
                    <span className="font-bold text-slate-700">
                      ₱{displaySubtotalPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-emerald-600">
                    <span className="font-sans font-bold">
                      DISCOUNT{discountType && discountType !== 'none' ? ` (${discountType.toUpperCase()})` : ''}:
                    </span>
                    <span className="font-bold">
                      -₱{activeDiscountPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="text-slate-300 tracking-tighter text-[9px] text-center my-0.5">--------------------------------</div>
                </>
              )}

              <div className="flex justify-between items-center">
                <span className="font-sans font-black text-[8px] uppercase tracking-wider text-slate-400">KABUUAN:</span>
                <span className="font-sans font-black text-sm text-slate-950">
                  ₱{totalAmountPesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Stylized custom QR/Barcode Graphic on Thermal Paper */}
            <div className="flex flex-col items-center justify-center py-2.5 bg-slate-50 rounded-xl border border-slate-100 text-center mb-4 gap-1.5 no-print">
              <div className="h-10 w-44 bg-[repeating-linear-gradient(90deg,#1e293b,#1e293b_2px,#fff_2px,#fff_8px)] opacity-85" />
              <span className="text-[7px] font-sans font-bold tracking-widest text-slate-400">POS-VERIFIED-TRANSACTION</span>
            </div>

            {/* Receipt Footer */}
            <div className="text-center space-y-1 font-sans text-slate-400 text-[7px] font-bold">
              <p className="text-[8px] text-slate-600">Maraming Salamat Po!</p>
              <p>Salamat sa inyong pagtangkilik!</p>
              <p>Powered by <span translate="no" className="notranslate">Katuwang Solutions</span></p>
            </div>

            {/* Jagged Serrated Tear Edge (Visual paper tear) */}
            <div className="absolute bottom-[-6px] inset-x-0 h-2.5 bg-[radial-gradient(circle_at_bottom,transparent_4px,white_4px)] bg-[length:12px_12px] repeat-x pointer-events-none no-print" />
          </div>

        </div>

        {/* BT Status Notifications (No-Print) */}
        <div className="no-print">
          {btError && (
            <div className="bg-red-950/80 text-red-300 border-y border-red-900/60 p-3 text-[10px] font-bold flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
              <span className="truncate">{btError}</span>
            </div>
          )}
          {btSuccess && (
            <div className="bg-emerald-950/80 text-emerald-300 border-y border-emerald-900/60 p-3 text-[10px] font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-400 animate-bounce" />
              Resibo na-print na sa Bluetooth thermal printer!
            </div>
          )}
        </div>

        {/* Print Buttons Container (No-Print) */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/80 flex flex-col gap-2.5 no-print">
          <div className="grid grid-cols-2 gap-2">
            
            {/* Web Bluetooth print trigger */}
            <Button 
              onClick={handleBluetoothPrint}
              disabled={isPrintingBt}
              className="h-11 rounded-xl text-white font-black flex items-center justify-center gap-1.5 text-xs bg-slate-800 border border-slate-700 hover:bg-slate-700/80 cursor-pointer"
            >
              {isPrintingBt ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : (
                <Bluetooth className="h-4 w-4 text-blue-400" />
              )}
              Print (Bluetooth)
            </Button>

            {/* Local standard printer print trigger (Save as PDF / Print) */}
            <Button 
              onClick={handleSystemPrint}
              className="h-11 text-white font-black rounded-xl flex items-center justify-center gap-1.5 text-xs border-none cursor-pointer"
              style={{ 
                backgroundColor: theme?.primary || '#000',
                boxShadow: `0 8px 16px -4px ${theme?.primary || '#000'}40` 
              }}
            >
              <FileText className="h-4 w-4" />
              Save as PDF
            </Button>
            
            {/* Image Download - Uses html-to-image to generate JPG */}
            <Button 
              onClick={handleDownloadImage}
              className="h-11 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 font-black rounded-xl flex items-center justify-center gap-1.5 text-xs cursor-pointer"
            >
              <Image className="h-4 w-4" />
              Save as JPG
            </Button>

            {/* Edit Sale (Optional) */}
            {onEditSale && (
              <Button 
                onClick={onEditSale}
                className="h-11 text-blue-600 bg-blue-50 hover:bg-blue-100 font-black rounded-xl flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              >
                <Edit3 className="h-4 w-4" />
                Edit Transaksyon
              </Button>
            )}
            
            {/* Void Sale (Optional) */}
            {onVoidSale && (
              <Button 
                onClick={onVoidSale}
                disabled={isVoiding}
                className="h-11 text-red-600 bg-red-50 hover:bg-red-100 font-black rounded-xl flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              >
                {isVoiding ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Void Sale
              </Button>
            )}

          </div>

          <Button 
            variant="ghost"
            onClick={onClose}
            className="w-full h-10 rounded-xl text-slate-400 hover:text-slate-300 font-bold text-[10px] uppercase tracking-wider cursor-pointer"
          >
            Matapos at Bumalik sa POS
          </Button>
        </div>

      </div>
    </div>
  );
}
