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

interface RoomSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSetup: (roomNames: string[]) => Promise<void>;
  theme: any;
}

export function RoomSetupModal({ open, onClose, onSetup, theme }: RoomSetupModalProps) {
  const [roomInput, setRoomInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSetup = async () => {
    if (!roomInput.trim()) return;
    
    const names = roomInput.split(',').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) return;

    try {
      setIsProcessing(true);
      await onSetup(names);
      onClose();
      setRoomInput('');
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
          <DialogTitle>Add / Setup Rooms</DialogTitle>
          <DialogDescription>
            Enter the names of the rooms you want to add, separated by commas. (e.g. Room 1, Room 2, VIP Room, Sauna)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Room Names</Label>
            <Input 
              placeholder="Room 1, VIP Room, Room 3..." 
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>Cancel</Button>
          <Button 
            onClick={handleSetup} 
            disabled={isProcessing || !roomInput.trim()}
            style={{ backgroundColor: theme.primary }}
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add Rooms
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
