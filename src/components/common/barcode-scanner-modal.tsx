'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, QrCode, Search, AlertCircle, RefreshCw } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (sku: string) => void;
  themeColor?: string;
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onScanResult,
  themeColor = '#06B6D4'
}: BarcodeScannerModalProps) {
  const [manualSku, setManualSku] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera interface is not supported on this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Check for native BarcodeDetector API if available
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a']
        });
        const detectLoop = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const scannedValue = barcodes[0].rawValue;
              if (scannedValue) {
                onScanResult(scannedValue);
                onClose();
                return;
              }
            }
          } catch (e) {
            // Ignore scan errors in animation frame loop
          }
          if (streamRef.current) requestAnimationFrame(detectLoop);
        };
        requestAnimationFrame(detectLoop);
      }
    } catch (err: any) {
      console.warn('Camera access issue:', err);
      setCameraError(err.message || 'Camera access denied or unavailable.');
      setIsScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualSku.trim()) {
      onScanResult(manualSku.trim());
      setManualSku('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl p-6 bg-white border-slate-200">
        <DialogHeader className="text-left space-y-1">
          <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
            <Camera className="h-5 w-5" style={{ color: themeColor }} />
            <span>Barcode Scanner</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            I-scan ang barcode ng produkto gamit ang camera o i-type ang SKU.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Camera Viewfinder */}
          <div className="relative w-full h-48 bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-dashed border-slate-700">
            {cameraError ? (
              <div className="p-4 text-center text-slate-400 space-y-2">
                <AlertCircle className="h-6 w-6 mx-auto text-amber-400" />
                <p className="text-xs font-semibold">{cameraError}</p>
                <p className="text-[10px] text-slate-500">Gamitin ang manual SKU input sa ibaba.</p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                <div className="absolute inset-0 border-2 border-cyan-400/60 rounded-2xl pointer-events-none animate-pulse" />
                <div className="absolute top-2 left-2 bg-slate-900/80 text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin text-cyan-400" />
                  <span>Scanning...</span>
                </div>
              </>
            )}
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              Manual Barcode / SKU Entry
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={manualSku}
                onChange={(e) => setManualSku(e.target.value)}
                placeholder="Type or paste barcode number..."
                className="h-10 text-xs font-bold rounded-xl flex-1"
              />
              <Button
                type="submit"
                className="h-10 px-4 rounded-xl font-black text-xs text-white"
                style={{ backgroundColor: themeColor }}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </form>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={onClose} className="rounded-xl h-9 px-4 font-bold text-xs">
              Isara
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
