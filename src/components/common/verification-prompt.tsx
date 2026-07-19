import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

interface VerificationPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /** If provided, the user must type this exact string to enable the confirm button */
  verificationString?: string;
}

export function VerificationPrompt({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  verificationString
}: VerificationPromptProps) {
  const [inputValue, setInputValue] = useState('');

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset on close
      setTimeout(() => setInputValue(''), 200);
    }
    onOpenChange(newOpen);
  };

  const isVerified = !verificationString || inputValue === verificationString;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="rounded-[24px] sm:max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-black text-xl text-slate-800">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm font-medium text-slate-500 leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {verificationString && (
          <div className="my-4 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Type <span className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">"{verificationString}"</span> to verify
            </label>
            <Input 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={verificationString}
              className="bg-slate-50 border-slate-200 focus-visible:ring-slate-300 font-bold"
            />
          </div>
        )}

        <AlertDialogFooter className="mt-2 gap-2 sm:gap-0">
          <AlertDialogCancel className="rounded-xl font-bold border-slate-200">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
              if (!isVerified) {
                e.preventDefault();
                return;
              }
              onConfirm();
            }}
            disabled={!isVerified}
            className={`rounded-xl font-bold transition-all ${
              destructive 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
