"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X, FileText, CheckCircle2, ShieldCheck, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: any;
  daysWorked: number;
  overtimeHours: number;
  commissionsPesos: number;
  valeDeductionPesos: number;
  applyStatutory: boolean;
  tenantName: string;
  theme: any;
}

export function PayslipModal({
  isOpen,
  onClose,
  employee,
  daysWorked,
  overtimeHours,
  commissionsPesos,
  valeDeductionPesos,
  applyStatutory,
  tenantName,
  theme
}: PayslipModalProps) {
  if (!employee) return null;

  const baseRatePesos = (employee.baseSalary || 0) / 100;
  const isDaily = employee.salaryType === 'daily';

  // Gross Pay Computations
  const basicPayPesos = isDaily ? (baseRatePesos * daysWorked) : baseRatePesos;
  const hourlyRate = isDaily ? (baseRatePesos / 8) : ((baseRatePesos / 26) / 8);
  const overtimePayPesos = Math.round(overtimeHours * hourlyRate * 1.25);
  const grossPayPesos = basicPayPesos + overtimePayPesos + commissionsPesos;

  // Statutory Deductions Estimate (PH standard tier estimates for SME)
  let sssPesos = 0;
  let philHealthPesos = 0;
  let pagIbigPesos = 0;

  if (applyStatutory && grossPayPesos > 0) {
    sssPesos = Math.min(900, Math.max(180, Math.round(grossPayPesos * 0.045)));
    philHealthPesos = Math.round(grossPayPesos * 0.02);
    pagIbigPesos = 100;
  }

  const totalStatutoryDeductions = sssPesos + philHealthPesos + pagIbigPesos;
  const totalDeductionsPesos = valeDeductionPesos + totalStatutoryDeductions;
  const netTakeHomePesos = Math.max(0, grossPayPesos - totalDeductionsPesos);

  const todayStr = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden bg-white shadow-2xl print:shadow-none print:max-w-none print:w-full">
        {/* Modal Header */}
        <DialogHeader className="p-4 bg-slate-900 text-white flex flex-row items-center justify-between print:hidden">
          <DialogTitle className="text-sm font-black flex items-center gap-2 text-slate-100">
            <FileText className="h-4 w-4 text-emerald-400" /> Official Payslip Preview
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" className="h-7 text-xs font-bold gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-none" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" /> Print / PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Payslip Document Body */}
        <div id="printable-payslip" className="p-6 space-y-4 text-slate-800 font-sans">
          
          {/* Company & Employee Header */}
          <div className="border-b border-slate-200 pb-3 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-headline font-black text-lg text-slate-900">
                <Building2 className="h-5 w-5 text-slate-700" />
                <span>{tenantName || "Katuwang Partner Store"}</span>
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Official Employee Payslip</p>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-300 bg-slate-50 text-slate-600">
                Date: {todayStr}
              </Badge>
            </div>
          </div>

          {/* Employee Info Block */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Employee Name</p>
              <p className="font-extrabold text-slate-800 text-sm">{employee.name}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Position / Role</p>
              <p className="font-extrabold text-slate-700">{employee.position || 'Staff'}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Salary Mode</p>
              <p className="font-bold text-slate-700 capitalize">₱{baseRatePesos.toLocaleString()} / {employee.salaryType}</p>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400">Period Logged</p>
              <p className="font-bold text-slate-700">{isDaily ? `${daysWorked} days` : 'Monthly Period'}</p>
            </div>
          </div>

          {/* Earnings & Deductions Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            
            {/* Earnings Column */}
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-black uppercase text-emerald-800 border-b border-emerald-200/60 pb-1">
                ➕ Gross Earnings
              </p>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Basic Salary:</span>
                <span className="font-bold text-slate-800">₱{basicPayPesos.toLocaleString()}</span>
              </div>
              {overtimeHours > 0 && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Overtime ({overtimeHours}h):</span>
                  <span className="font-bold text-slate-800">₱{overtimePayPesos.toLocaleString()}</span>
                </div>
              )}
              {commissionsPesos > 0 && (
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Commissions:</span>
                  <span className="font-bold text-slate-800">₱{commissionsPesos.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t border-emerald-200/80 pt-1.5 flex justify-between font-black text-emerald-900">
                <span>Total Gross:</span>
                <span>₱{grossPayPesos.toLocaleString()}</span>
              </div>
            </div>

            {/* Deductions Column */}
            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-black uppercase text-red-800 border-b border-red-200/60 pb-1">
                ➖ Deductions
              </p>
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Vale Repayment:</span>
                <span className="font-bold text-red-700">₱{valeDeductionPesos.toLocaleString()}</span>
              </div>
              {applyStatutory && (
                <>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>SSS Contribution:</span>
                    <span>₱{sssPesos.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>PhilHealth:</span>
                    <span>₱{philHealthPesos.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Pag-IBIG:</span>
                    <span>₱{pagIbigPesos.toLocaleString()}</span>
                  </div>
                </>
              )}
              <div className="border-t border-red-200/80 pt-1.5 flex justify-between font-black text-red-900">
                <span>Total Deductions:</span>
                <span>₱{totalDeductionsPesos.toLocaleString()}</span>
              </div>
            </div>

          </div>

          {/* Highlighted Net Take-Home Pay Box */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">NET TAKE-HOME PAY</p>
              <p className="text-xs text-slate-400">Total Net Amount Payable</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black font-headline text-emerald-400">
                ₱{netTakeHomePesos.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Signature Block */}
          <div className="pt-6 grid grid-cols-2 gap-6 text-[10px] font-bold text-slate-400">
            <div className="border-t border-slate-300 pt-1.5 text-center">
              <p className="text-slate-700 font-black">{employee.name}</p>
              <p>Employee Signature</p>
            </div>
            <div className="border-t border-slate-300 pt-1.5 text-center">
              <p className="text-slate-700 font-black">Authorized Representative</p>
              <p>Employer Signature</p>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
