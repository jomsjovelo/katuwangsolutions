"use client"

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bluetooth, Printer, CheckCircle, AlertCircle, RefreshCw, Smartphone, HelpCircle, FileText } from 'lucide-react';
import { EscPosBluetoothDriver } from '@/lib/hardware/print-driver';
import { useTenant } from '@/app/lib/tenant-context';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface BluetoothPrinterModalProps {
  open: boolean;
  onClose: () => void;
}

export function BluetoothPrinterModal({ open, onClose }: BluetoothPrinterModalProps) {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPrintingTest, setIsPrintingTest] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);

  useEffect(() => {
    setIsBluetoothSupported(typeof window !== 'undefined' && !!(navigator as any).bluetooth);
  }, []);

  const isConnected = EscPosBluetoothDriver.isConnected();
  const connectedName = EscPosBluetoothDriver.getConnectedDeviceName();

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setErrorMsg(null);

      const driver = new EscPosBluetoothDriver();
      await driver.connect(true);

      toast({
        title: "Printer Connected!",
        description: `Konektado na sa ${EscPosBluetoothDriver.getConnectedDeviceName() || 'Bluetooth Thermal Printer'}.`,
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Hindi kumonekta sa Bluetooth printer.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleTestPrint = async () => {
    try {
      setIsPrintingTest(true);
      setErrorMsg(null);

      const driver = new EscPosBluetoothDriver();
      if (!EscPosBluetoothDriver.isConnected()) {
        await driver.connect();
      }

      const testPayload = driver.formatTestReceipt(currentTenant?.name || "Katuwang Store");
      await driver.print(testPayload);

      toast({
        title: "Test Receipt Printed!",
        description: "Na-print nang maayos ang subok na resibo sa iyong printer.",
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Bumagsak ang test print job.");
    } finally {
      setIsPrintingTest(false);
    }
  };

  const handleDisconnect = () => {
    EscPosBluetoothDriver.disconnect();
    toast({
      title: "Disconnected",
      description: "Na-disconnect ang Bluetooth printer.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-md rounded-[28px] overflow-hidden p-0 gap-0 border-slate-200 shadow-2xl bg-white">
        
        {/* Modal Header */}
        <div className="bg-slate-900 p-6 text-white relative flex flex-col items-center text-center">
          <div className="h-14 w-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-3">
            <Bluetooth className="h-7 w-7 text-blue-400" />
          </div>
          <DialogTitle className="text-xl font-headline font-black text-white">
            Universal POS Printer Setup
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-300 font-medium mt-1">
            Gumagana sa anumang POS Thermal Printer (58mm, 80mm, 110mm, Bluetooth, o AirPrint).
          </DialogDescription>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-4 bg-white">
          
          {/* iOS / Safari AirPrint Fallback Banner */}
          {!isBluetoothSupported && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <Smartphone className="h-4 w-4 text-amber-600 shrink-0" />
                <span>iOS / Safari Device Mode (AirPrint & PDF Ready)</span>
              </div>
              <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                Ang iOS Safari ay gumagamit ng **AirPrint / Save as PDF** system. Maaari kang mag-print sa anumang POS printer o Wireless printer sa pamamagitan ng System Print.
              </p>
              <Button
                type="button"
                onClick={() => window.print()}
                className="w-full h-10 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs gap-2 mt-1 cursor-pointer"
              >
                <FileText className="h-4 w-4" /> Mag-print via AirPrint / System Print
              </Button>
            </div>
          )}

          {/* Connection Status Card */}
          <div className={cn(
            "p-4 rounded-2xl border flex items-center justify-between gap-3 transition-colors",
            isConnected 
              ? "bg-emerald-50/80 border-emerald-200/80 text-emerald-950" 
              : "bg-slate-50 border-slate-200 text-slate-800"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-bold",
                isConnected ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
              )}>
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status ng Printer</p>
                <p className="font-bold text-xs sm:text-sm">
                  {isConnected ? (
                    <span className="text-emerald-700 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                      Konektado: {connectedName || 'POS Printer'}
                    </span>
                  ) : (
                    'Walang Konektadong Printer'
                  )}
                </p>
              </div>
            </div>

            {isConnected && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                className="h-8 px-2 text-rose-600 hover:bg-rose-50 rounded-xl text-[11px] font-bold"
              >
                Disconnect
              </Button>
            )}
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl flex items-start gap-2.5 text-rose-800 text-xs font-medium">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Main Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl text-xs gap-2 shadow-sm cursor-pointer"
            >
              {isConnecting ? (
                <RefreshCw className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Bluetooth className="h-4 w-4" />
              )}
              {isConnected ? 'I-reconnect / Palitan' : 'I-connect ang Printer'}
            </Button>

            <Button
              type="button"
              onClick={handleTestPrint}
              disabled={isPrintingTest}
              variant="outline"
              className="h-12 border-slate-200 hover:bg-slate-50 text-slate-800 font-bold rounded-2xl text-xs gap-2 cursor-pointer"
            >
              {isPrintingTest ? (
                <RefreshCw className="h-4 w-4 animate-spin text-slate-600" />
              ) : (
                <Printer className="h-4 w-4 text-indigo-600" />
              )}
              Subukan ang Print
            </Button>
          </div>

          {/* Guided Checklist / Tips */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-800 font-bold text-[11px]">
              <HelpCircle className="h-4 w-4 text-indigo-600" />
              Gabay sa Pag-connect:
            </div>
            <ul className="space-y-1.5 text-slate-600 text-[11px] font-medium list-disc list-inside">
              <li>Maaaring gamitin sa **58mm, 80mm, o 110mm** POS thermal printers.</li>
              <li>Siguraduhing **Naka-ON** ang iyong Bluetooth / Wireless thermal printer.</li>
              <li>Sa Android o Desktop: Gamitin ang **Chrome** o **Brave** browser.</li>
              <li>Sa iPhone o iPad: Gamitin ang **AirPrint / Save as PDF** o Bluetooth bridge.</li>
            </ul>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
