"use client"

import React, { useState } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { addEmployee } from '@/firebase/firestore/finance-actions';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, query, orderBy, getFirestore } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase/index';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getModuleTheme, useDynamicThemeColor } from '@/lib/theme-utils';
import { 
  Users, 
  ArrowRight,
  Calculator,
  UserPlus,
  Loader2,
  AlertCircle
} from "lucide-react";

export function PayrollDashboard() {
  const { currentTenant } = useTenant();
  const db = getFirestore(initializeFirebase().app, 'katuwang');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamically resolve Katuwang industry theme based on active tenant's moduleType
  const theme = getModuleTheme(currentTenant?.moduleType);
  
  // Immersive dynamic status bar viewport tracking for PWA Android/iOS notch
  useDynamicThemeColor(theme);

  // Live stream of employees
  const empQuery = currentTenant 
    ? query(
        collection(db, 'tenants', currentTenant.id, 'employees'),
        orderBy('createdAt', 'desc')
      )
    : null;

  const [empSnapshot, loading, hookError] = useCollection(empQuery as any);
  
  const employees = empSnapshot?.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data()
  })) || [];

  const activeEmployees = employees.filter((e: any) => e.isActive !== false); // default to true
  const totalEstimatedPayroll = activeEmployees.reduce((acc: number, e: any) => {
    // For MVP, just assume 5 days present for daily workers
    if (e.salaryType === 'daily') return acc + (e.baseSalary * 5);
    return acc + e.baseSalary;
  }, 0);

  const handleQuickAddStaff = async () => {
    if (!currentTenant) return;
    try {
      setIsProcessing(true);
      setError(null);
      await addEmployee(currentTenant.id, {
        name: `Test Staff ${Math.floor(Math.random() * 1000)}`,
        role: 'Crew',
        baseSalary: 60000, // ₱600.00 daily
        salaryType: 'daily',
        isActive: true
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50">
      <main className="p-4 space-y-6 pb-20">
        
        {/* Header Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-headline font-bold">Sahod Flow</h3>
              <p className="text-xs text-muted-foreground font-medium">{theme.name} • {currentTenant?.name || 'Payroll System'}</p>
            </div>
            <Button 
              onClick={handleQuickAddStaff}
              disabled={isProcessing}
              size="sm" 
              className="rounded-full shadow-md font-bold text-white border-none active:scale-95 transition-all duration-200"
              style={{ backgroundColor: theme.primary }}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />} 
              Add Test Staff
            </Button>
          </div>
        </section>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Master Payroll Card Styled dynamically with active module gradient */}
        <Card 
          className={cn(
            "text-white border-none shadow-xl relative overflow-hidden bg-gradient-to-br transition-all duration-500",
            theme.primaryBg,
            theme.glowClass
          )}
        >
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-white/5 blur-2xl" />
          
          <CardHeader className="p-4 pb-2 relative z-10">
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-white/70">Total Est. Payroll (This Period)</CardDescription>
            <CardTitle className="text-4xl font-black font-headline tracking-tighter">
              ₱{(totalEstimatedPayroll / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 relative z-10">
            <div className="flex gap-2 mt-2">
              <Badge className="bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-sm">
                <Users className="h-3 w-3 mr-1" /> {activeEmployees.length} Active Staff
              </Badge>
              <Badge 
                className="border-none backdrop-blur-sm"
                style={{ backgroundColor: `${theme.secondary}30`, color: theme.secondaryText === 'text-slate-900' ? '#fff' : theme.secondary }}
              >
                Live DB Stream
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Button 
          className="w-full rounded-xl h-14 text-white font-bold active:scale-95 transition-all text-base border-none"
          style={{ 
            backgroundColor: theme.primary, 
            boxShadow: `0 8px 16px -4px ${theme.primary}40` 
          }}
        >
          <Calculator className="mr-2 h-5 w-5" /> Run Payroll Wizard
        </Button>

        {/* Employee List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Live DB Roster</h3>
            <Button 
              variant="link" 
              className="font-bold text-xs p-0"
              style={{ color: theme.primary }}
            >
              Manage
            </Button>
          </div>
          
          <div className="grid gap-2">
            {loading && <div className="text-center py-4 text-xs text-slate-400">Loading stream...</div>}
            {!loading && employees.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400 border-2 border-dashed rounded-xl">No staff found. Click \'Add Test Staff\' above.</div>
            )}
            
            {employees.map((emp: any) => (
              <div key={emp.id} className="bg-white border border-slate-100 shadow-sm rounded-xl p-3 flex items-center justify-between active:scale-[0.98] transition-transform">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div 
                      className="h-10 w-10 rounded-full flex items-center justify-center font-bold"
                      style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                    >
                      {emp.name.charAt(0)}
                    </div>
                    {emp.isActive ? (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    ) : (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-amber-500" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{emp.name}</h4>
                    <p className="text-[10px] text-slate-500 font-medium">{emp.role || 'Staff'} • ₱{(emp.baseSalary / 100).toLocaleString()}/{emp.salaryType}</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {emp.salaryType === 'daily' ? (
                    <Badge variant="outline" className="text-[9px] font-black uppercase bg-slate-50 text-slate-600">
                      5 Days Present
                    </Badge>
                  ) : (
                    <Badge 
                      variant="outline" 
                      className="text-[9px] font-black uppercase border-transparent"
                      style={{ backgroundColor: `${theme.primary}12`, color: theme.primary }}
                    >
                      Fixed Salary
                    </Badge>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-colors"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
