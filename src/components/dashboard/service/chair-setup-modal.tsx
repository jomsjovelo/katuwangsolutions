"use client"

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ChairSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSetup: (chairNames: string[]) => Promise<void>;
  theme: any;
}

export function ChairSetupModal({ open, onClose, onSetup, theme }: ChairSetupModalProps) {
  const [chairInput, setChairInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSetup = async () => {
    if (!chairInput.trim()) return;
    
    const names = chairInput.split(',').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) return;

    try {
      setIsProcessing(true);
      await onSetup(names);
      onClose();
      setChairInput('');
    } catch (e) {
      console.error("Setup error", e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add / Setup Chairs</DialogTitle>
          <DialogDescription>
            Enter the names of the chairs you want to add, separated by commas. (e.g. Chair 1, Chair 2, VIP Chair)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Chair Names</Label>
            <Input 
              placeholder="Chair 1, Chair 2, VIP Chair..." 
              value={chairInput}
              onChange={(e) => setChairInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
          <Button 
            onClick={handleSetup} 
            disabled={isProcessing || !chairInput.trim()}
            style={{ backgroundColor: theme.primary }}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add Chairs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
