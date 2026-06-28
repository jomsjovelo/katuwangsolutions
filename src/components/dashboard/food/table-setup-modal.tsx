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

interface TableSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSetup: (tableNames: string[]) => Promise<void>;
  theme: any;
}

export function TableSetupModal({ open, onClose, onSetup, theme }: TableSetupModalProps) {
  const [tableInput, setTableInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSetup = async () => {
    if (!tableInput.trim()) return;
    
    const names = tableInput.split(',').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) return;

    try {
      setIsProcessing(true);
      await onSetup(names);
      onClose();
      setTableInput('');
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
          <DialogTitle>Add / Setup Dine-In Tables</DialogTitle>
          <DialogDescription>
            Enter the names of the tables you want to add, separated by commas. (e.g. Table 1, Table 2, VIP A, Counter)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Table Names</Label>
            <Input 
              placeholder="Table 1, Table 2, Table 3..." 
              value={tableInput}
              onChange={(e) => setTableInput(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
          <Button 
            onClick={handleSetup} 
            disabled={isProcessing || !tableInput.trim()}
            style={{ backgroundColor: theme.primary }}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add Tables
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
