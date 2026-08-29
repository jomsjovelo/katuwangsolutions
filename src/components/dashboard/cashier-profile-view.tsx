'use client';

import React, { useState, useRef } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useSecureCashierStore } from '@/store/use-secure-cashier-store';
import { useTenantStore } from '@/store/use-tenant-store';
import { executeCashierLogoutCoordinator } from '@/lib/client/secure-benta-cashier-client';
import {
  handleCashierLogoutClick,
  performCashierLogoutAction
} from '@/lib/client/cashier-profile-controller';
import { StaffShiftCard } from './staff-shift-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { User, Store, LogOut, Loader2, Printer, AlertCircle } from 'lucide-react';
import { EscPosBluetoothDriver } from '@/lib/hardware/print-driver';

export interface CashierProfileViewProps {
  logoutCoordinatorFn?: typeof executeCashierLogoutCoordinator;
  onRedirect?: () => void;
}

export function CashierProfileView(props: CashierProfileViewProps = {}) {
  const { user } = useUser();
  const bootstrap = useSecureCashierStore(state => state.bootstrap);
  const cashierShift = useSecureCashierStore(state => state.activeShift);
  const resetTenantStore = useTenantStore(state => state.reset);

  const isLoggingOutRef = useRef(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showShiftConfirmDialog, setShowShiftConfirmDialog] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [btStatus, setBtStatus] = useState<string>('Not Connected');

  const cashierName = bootstrap?.cashierDisplayName || 'Cashier';
  const storeName = bootstrap?.tenantDisplayName || 'Katuwang Store';

  const performLogout = () =>
    performCashierLogoutAction({
      user,
      hasActiveShift: Boolean(cashierShift),
      shiftId: cashierShift?.id,
      isLoggingOutRef,
      setIsLoggingOut,
      setShowShiftConfirmDialog,
      setLogoutError,
      logoutCoordinatorFn: props.logoutCoordinatorFn,
      clearCashierSession: () => useSecureCashierStore.getState().clearCashierSession(),
      resetTenantStore: () => resetTenantStore(),
      onRedirect: props.onRedirect
    });

  const handleLogoutClick = () =>
    handleCashierLogoutClick({
      isLoggingOutRef,
      hasActiveShift: Boolean(cashierShift),
      setShowShiftConfirmDialog,
      setLogoutError,
      performLogout
    });

  const handleTestPrinter = async () => {
    try {
      setBtStatus('Connecting...');
      const driver = new EscPosBluetoothDriver();
      const connected = await driver.connect();
      if (connected) {
        setBtStatus('Connected & Printing Test...');
        const bytes = driver.formatReceipt(
          storeName,
          [{ name: 'Test Item', price: 10000, quantity: 1, productId: '1' }],
          100.00,
          'TEST'
        );
        await driver.print(bytes);
        setBtStatus('Success!');
        setTimeout(() => setBtStatus('Not Connected'), 3000);
      }
    } catch (e: any) {
      setBtStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-2xl mx-auto space-y-6 pb-24">
      {/* Cashier Identity Banner */}
      <Card className="bg-white border-slate-200 shadow-sm rounded-3xl overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-2xl shrink-0">
              <User className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">{cashierName}</h2>
                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-blue-200 text-blue-600 bg-blue-50">
                  Benta Snap Cashier
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                <Store className="h-3.5 w-3.5 text-slate-400" />
                <span>{storeName}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Shift Management Section */}
      <StaffShiftCard />

      {/* Hardware / Receipt Printer Section */}
      <Card className="bg-white border-slate-200 shadow-sm rounded-3xl overflow-hidden">
        <CardHeader className="p-4 pb-2 border-b border-slate-50">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
            <Printer className="h-4 w-4" /> Thermal Receipt Printer
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs text-slate-500 font-medium">
            I-connect ang Bluetooth thermal printer para sa awtomatikong pag-print ng resibo.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600">Status: {btStatus}</span>
            <Button
              onClick={handleTestPrinter}
              variant="outline"
              size="sm"
              className="rounded-xl font-bold text-xs"
            >
              Test Print
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logout Error Notice */}
      {logoutError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-xs font-bold">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{logoutError}</span>
        </div>
      )}

      {/* Trusted Logout Button */}
      <Button
        onClick={handleLogoutClick}
        disabled={isLoggingOut}
        variant="destructive"
        className="w-full h-14 rounded-2xl font-black text-base shadow-lg shadow-rose-600/20 active:scale-98 transition-transform flex items-center justify-center gap-2"
      >
        {isLoggingOut ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Nila-logout sa Server...</span>
          </>
        ) : (
          <>
            <LogOut className="h-5 w-5" />
            <span>Mag-logout (Sign Out)</span>
          </>
        )}
      </Button>

      {/* Controlled In-App Shift Active Confirmation Dialog */}
      <AlertDialog open={showShiftConfirmDialog} onOpenChange={setShowShiftConfirmDialog}>
        <AlertDialogContent className="rounded-3xl max-w-md border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-black text-slate-900">
              May Bukas Pang Shift
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-slate-600 font-medium leading-relaxed">
              May bukas ka pang shift ({cashierShift?.id}). Nais mo bang mag-logout pa rin? Ang inyong shift ay mananatiling bukas sa server para sa inyong pagbabalik.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
            <AlertDialogCancel
              disabled={isLoggingOut}
              className="rounded-xl font-bold border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              Manatili (Cancel)
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                performLogout();
              }}
              disabled={isLoggingOut}
              className="rounded-xl font-black bg-rose-600 hover:bg-rose-700 text-white"
            >
              Ituloy ang Pag-logout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
