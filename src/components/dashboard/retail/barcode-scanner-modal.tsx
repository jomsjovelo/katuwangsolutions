"use client"

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from "@/components/ui/badge";
import { 
  Camera, 
  CameraOff, 
  X, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  Maximize2
} from "lucide-react";

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  products: any[];
  onProductScanned: (product: any) => void;
  theme: any;
}

import { playBarcodeBeep } from '@/lib/hardware/audio-synthesizer';

// Synthesize high-pitched POS barcode scanner register beep (standard 1200Hz cash register sweep)
export const playScanBeep = () => playBarcodeBeep();

export function BarcodeScannerModal({
  open,
  onClose,
  products,
  onProductScanned,
  theme
}: BarcodeScannerModalProps) {
  const [hasCameraAccess, setHasCameraAccess] = useState<boolean | null>(null);
  const [selectedSimProduct, setSelectedSimProduct] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const scannerRef = useRef<any>(null);
  const regionId = "katuwang-reader-viewport";

  // Synthesize products that have SKUs or fallbacks
  const skuProducts = products.filter(p => p.isActive);

  useEffect(() => {
    if (skuProducts.length > 0 && !selectedSimProduct) {
      setSelectedSimProduct(skuProducts[0].id);
    }
  }, [skuProducts, selectedSimProduct]);

  // Load and configure html5-qrcode camera stream
  useEffect(() => {
    if (!open) {
      stopScanner();
      return;
    }

    // Dynamic import to support SSR/Next.js environment securely
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      // 1. Enforce camera permission check
      Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length > 0) {
          setHasCameraAccess(true);
          startScanner(Html5Qrcode);
        } else {
          setHasCameraAccess(false);
        }
      }).catch((err: any) => {
        console.error("Error accessing camera roster", err);
        setHasCameraAccess(false);
      });
    }).catch((err: any) => {
      console.error("Error loading html5-qrcode package", err);
    });

    return () => {
      stopScanner();
    };
  }, [open]);

  const startScanner = (Html5QrcodeClass: any) => {
    try {
      const html5Qrcode = new Html5QrcodeClass(regionId);
      scannerRef.current = html5Qrcode;

      const config = {
        fps: 8,
        qrbox: { width: 220, height: 140 },
        videoConstraints: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "environment"
        }
      };

      html5Qrcode.start(
        { facingMode: "environment" },
        config,
        (decodedText: any) => {
          // Success scanner callback
          handleCodeDecoded(decodedText);
        },
        (errorMessage: any) => {
          // Silent continuous scanning errors (e.g. frame did not contain a code)
        }
      ).then(() => {
        setIsCameraActive(true);
      }).catch((err: any) => {
        console.error("Scanner failed to start", err);
        setIsCameraActive(false);
      });
    } catch (e) {
      console.error("HTML5-Qrcode start error", e);
    }
  };

  const stopScanner = () => {
    // 1. Force release native camera tracks to prevent hardware freeze locks
    try {
      const container = document.getElementById(regionId);
      const videos = container?.getElementsByTagName('video');
      if (videos) {
        for (let i = 0; i < videos.length; i++) {
          const video = videos[i] as any;
          const stream = video.srcObject as MediaStream;
          if (stream) {
            stream.getTracks().forEach(track => {
              track.stop();
              console.log("[Katuwang Camera Guard] Force stopped video track label:", track.label);
            });
            video.srcObject = null;
          }
        }
      }
    } catch (e) {
      console.warn("Native camera stream cleanup bypassed:", e);
    }

    // 2. Shut down scanner engine instance
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        scannerRef.current.stop().then(() => {
          setIsCameraActive(false);
          scannerRef.current = null;
        }).catch((err: any) => {
          console.error("Error stopping html5-qrcode library:", err);
        });
      } catch (e) {
        console.error("Scanner library stop failure:", e);
      }
    }
  };

  const handleCodeDecoded = (code: string) => {
    // Search products for matching SKU
    const match = products.find(p => p.sku === code || p.id === code);
    
    if (match) {
      playScanBeep();
      setScanFeedback(`Na-detect: ${match.name}`);
      onProductScanned(match);
      setTimeout(() => setScanFeedback(null), 1500);
    } else {
      // Beep anyway but show unmatched alert
      playScanBeep();
      setScanFeedback(`Barcode ${code} ay walang katugmang produkto.`);
      setTimeout(() => setScanFeedback(null), 2500);
    }
  };

  // Trigger high-fidelity POS simulation
  const handleSimulateScan = () => {
    if (!selectedSimProduct) return;
    const match = products.find(p => p.id === selectedSimProduct);
    if (!match) return;

    setIsSimulating(true);
    
    // Simulate laser sweep timing
    setTimeout(() => {
      setIsSimulating(false);
      playScanBeep();
      setScanFeedback(`Simulated: ${match.name}`);
      onProductScanned(match);
      setTimeout(() => setScanFeedback(null), 1500);
    }, 900);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden border border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-300">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div 
              className="h-8 w-8 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: theme.primary }}
            >
              <Camera className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-headline font-black text-xs uppercase tracking-widest text-slate-800">Barcode Scanner</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Continuous camera checkouts</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose} 
            className="h-8 w-8 rounded-full hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="h-4 w-4 text-slate-400" />
          </Button>
        </div>

        {/* Scanner Viewport Box */}
        <div className="p-5 flex-1 flex flex-col items-center justify-center space-y-4">
          <div className="relative h-[200px] w-full bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
            
            {/* Native camera viewport container */}
            <div id={regionId} className="absolute inset-0 h-full w-full object-cover" />

            {/* Glowing Laser Sweep Line (Active on camera or simulation) */}
            {(isCameraActive || isSimulating) && (
              <div 
                className={`absolute left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] z-10 ${
                  isSimulating ? 'animate-scanner-laser' : 'animate-pulse'
                }`}
                style={{
                  top: isSimulating ? '0%' : '50%'
                }}
              />
            )}

            {/* Simulated camera flash feed */}
            {isSimulating && (
              <div className="absolute inset-0 bg-red-500/10 z-0 animate-in fade-in duration-75" />
            )}

            {/* UI Viewport Overlays */}
            {!isCameraActive && !isSimulating && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/90 text-center p-6 gap-2">
                {hasCameraAccess === false ? (
                  <>
                    <CameraOff className="h-7 w-7 text-slate-500" />
                    <h4 className="font-black text-xs text-slate-300">Walang Camera Access</h4>
                    <p className="text-[9px] text-slate-500 leading-normal max-w-[200px]">
                      Paki-enable ang camera settings ng iyong browser, o gamitin ang Simulator sa ibaba!
                    </p>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                    <h4 className="font-black text-[10px] text-slate-400 uppercase tracking-widest">Kino-connect ang Camera...</h4>
                  </>
                )}
              </div>
            )}

            {/* Target Area Frame */}
            {(isCameraActive || isSimulating) && (
              <div className="absolute inset-0 border-[24px] border-slate-950/40 pointer-events-none z-10 flex items-center justify-center">
                <div className="h-[140px] w-[220px] border-2 border-white/40 rounded-xl relative shadow-[0_0_0_9999px_rgba(15,23,42,0.3)]">
                  {/* Neon targeting brackets */}
                  <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-red-500 rounded-tl" />
                  <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-red-500 rounded-tr" />
                  <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-red-500 rounded-bl" />
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-red-500 rounded-br" />
                </div>
              </div>
            )}

            {/* Instant scan feedback dialog overlay */}
            {scanFeedback && (
              <div className="absolute bottom-3 inset-x-3 z-30 bg-slate-900/90 text-white py-2 px-3 rounded-xl border border-slate-700/50 text-[10px] font-extrabold flex items-center justify-center gap-1.5 shadow-lg animate-in slide-in-from-bottom-2 duration-150">
                {scanFeedback.includes("detect") || scanFeedback.includes("Simulated") ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                )}
                <span className="truncate">{scanFeedback}</span>
              </div>
            )}
          </div>

          {/* Barcode Simulator Panel (High-fidelity developer playground) */}
          <div className="w-full bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Barcode Simulator</span>
              <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest bg-white border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                Playground
              </Badge>
            </div>
            
            <div className="space-y-2">
              <select 
                value={selectedSimProduct}
                onChange={(e) => setSelectedSimProduct(e.target.value)}
                disabled={isSimulating}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-slate-300 text-slate-700"
              >
                {skuProducts.length === 0 ? (
                  <option value="">Walang produkto sa imbentaryo</option>
                ) : (
                  skuProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(SKU: ${p.sku})` : '(No SKU)'}
                    </option>
                  ))
                )}
              </select>

              <Button 
                onClick={handleSimulateScan}
                disabled={isSimulating || !selectedSimProduct}
                className="w-full h-10 text-white font-bold rounded-xl flex items-center justify-center text-xs border-none active:scale-95 transition-transform"
                style={{ 
                  backgroundColor: theme.primary,
                  boxShadow: `0 4px 10px -2px ${theme.primary}40` 
                }}
              >
                {isSimulating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Bumabaril ng Laser...
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-4 w-4 mr-1.5" />
                    Simulate Beep & Scan
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Help Tip Footer */}
        <div className="p-4 border-t border-slate-50 bg-slate-50/50 text-center flex justify-center items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
          <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
          Itapat ang barcode o QR sa gitna ng bracket.
        </div>

      </div>
    </div>
  );
}
