"use client"

import React, { useState, useEffect, useRef } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PosCurrencyInput } from '@/components/ui/pos-currency-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getModuleTheme } from '@/lib/theme-utils';
import { useToast } from '@/hooks/use-toast';
import { generateIdempotencyKey, submitTsekInAdminMutation, TsekInClientError } from '@/lib/client/tsek-in-client';
import { resolveTsekInAdminIntent, type TsekInAdminIntent } from '@/lib/client/tsek-in-admin-intent';
import { Bed, Users, Plus, CheckCircle2, XCircle, MoreVertical, LogIn, LogOut, Brush, Trash2, Search } from 'lucide-react';
import { VerificationPrompt } from '@/components/common/verification-prompt';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInTimeZone } from 'date-fns-tz';
import { CheckInModal } from './modals/check-in-modal';
import { ManageStayModal } from './modals/manage-stay-modal';
import { AddRoomModal } from './modals/add-room-modal';
import { SettingsModal } from './modals/settings-modal';
const TIMEZONE = 'Asia/Manila';

export function TsekInRoomsDashboard() {
  const { currentTenant, setCurrentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);
  const { toast } = useToast();
  const [rooms, setRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const roomMutationIntentRef = useRef<TsekInAdminIntent | null>(null);


  // Check In Form state moved to CheckInModal
  const [selectedRoomId, setSelectedRoomId] = useState('');

  useEffect(() => {
    if (!currentTenant) return;
    const { db } = initializeFirebase();
    const unsubRooms = onSnapshot(query(collection(db, 'tenants', currentTenant.id, 'rooms'), orderBy('roomNumber', 'asc')), (snap) => {
      setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).filter(r => !r.deletedAt));
    });
    const unsubBookings = onSnapshot(query(collection(db, 'tenants', currentTenant.id, 'bookings'), orderBy('createdAt', 'desc')), snap => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubRooms(); unsubBookings(); };
  }, [currentTenant]);



  const handleDelete = async () => {
    if (!roomToDelete || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { request, nextIntent } = resolveTsekInAdminIntent(
        { operation: 'delete-room', roomId: roomToDelete },
        roomMutationIntentRef.current,
        generateIdempotencyKey,
      );
      roomMutationIntentRef.current = nextIntent;
      await submitTsekInAdminMutation(request);
      roomMutationIntentRef.current = null;
      toast({ title: "Deleted", description: "Room removed." });
      setRoomToDelete(null);
    } catch (error) {
      toast({ title: "Error", description: error instanceof TsekInClientError ? error.message : 'An unexpected error occurred. Please try again.', variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (roomId: string, status: 'Available'|'Occupied'|'Cleaning') => {
    if (status !== 'Available' || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { request, nextIntent } = resolveTsekInAdminIntent(
        { operation: 'mark-room-ready', roomId },
        roomMutationIntentRef.current,
        generateIdempotencyKey,
      );
      roomMutationIntentRef.current = nextIntent;
      await submitTsekInAdminMutation(request);
      roomMutationIntentRef.current = null;
    } catch (error) {
      toast({ title: "Error", description: error instanceof TsekInClientError ? error.message : 'An unexpected error occurred. Please try again.', variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'Available') return 'bg-emerald-100 text-emerald-700';
    if (status === 'Occupied') return 'bg-rose-100 text-rose-700';
    return 'bg-amber-100 text-amber-700';
  };

  const activeBookings = bookings.filter(b => b.status === 'Active');

  const onRoomClick = (room: any) => {
    if (room.status === 'Available') {
      setSelectedRoomId(room.id);
      setIsCheckInModalOpen(true);
    } else if (room.status === 'Occupied') {
      const activeBooking = activeBookings.find(b => b.roomId === room.id);
      if (activeBooking) {
        setSelectedBooking(activeBooking);
      }
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-black text-slate-800">Rooms</h2>
          <p className="text-sm text-slate-500">Manage your {rooms.length}/25 rooms</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setIsRateModalOpen(true)} variant="outline" className="rounded-xl shadow-sm">
            Manage Settings & Rate
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="rounded-xl shadow-sm" style={{ backgroundColor: theme.primary }}>
            <Plus className="h-4 w-4 mr-2" />
            Add Room
          </Button>
        </div>
      </div>
      {/* Room Occupancy Summary Strip */}
      <div className="bg-slate-100 p-3 rounded-2xl border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 text-xs font-bold">
          <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            🟢 Available: {rooms.filter(r => r.status === 'Available').length}
          </span>
          <span className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
            🔴 Occupied: {rooms.filter(r => r.status === 'Occupied').length}
          </span>
          <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
            🟡 Cleaning: {rooms.filter(r => r.status === 'Cleaning').length}
          </span>
        </div>
        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Total: {rooms.length} Rooms</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {roomToDelete && (
            <VerificationPrompt
              open={!!roomToDelete}
              onOpenChange={(open) => !open && setRoomToDelete(null)}
              title="Delete Room?"
              description={`Are you sure you want to delete this room? This will remove it from your inventory. Active bookings for this room may be affected.`}
              onConfirm={handleDelete}
              confirmText="Delete"
              destructive={true}
              verificationString="DELETE"
            />
          )}

          {rooms.map(room => (
          <Card 
            key={room.id} 
            className={`overflow-hidden border-slate-200 transition-all ${(room.status === 'Available' || room.status === 'Occupied') ? 'cursor-pointer hover:shadow-md hover:border-slate-300' : ''}`}
            onClick={(e) => {
              // Prevent triggering if clicked on the trash button or ready button
              if ((e.target as HTMLElement).closest('button')) return;
              onRoomClick(room);
            }}
          >
            <div className={`h-2 w-full ${getStatusColor(room.status).split(' ')[0]}`} />
            <CardContent className="p-4 relative">
              <div className="flex justify-between items-start mb-2">
                <span className="font-black text-lg text-slate-800">{room.roomNumber}</span>
                <Badge variant="secondary" className={getStatusColor(room.status)}>{room.status}</Badge>
              </div>
              <p className="text-xs font-bold text-slate-500 mb-1">{room.type} • {room.bedType}</p>
              <p className="text-sm font-bold" style={{ color: theme.primary }}>₱{((room.rateCentavos || (room.rate ? room.rate * 100 : 0)) / 100).toLocaleString()}/night</p>
              
              <div className="mt-4 flex gap-2">
                {room.status === 'Cleaning' && (
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => handleStatusChange(room.id, 'Available')}>
                    <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-500" />
                    Ready
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="absolute bottom-2 right-2 h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => setRoomToDelete(room.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rooms.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
            <Bed className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium">No rooms added yet.</p>
          </div>
        )}
      </div>

      <AddRoomModal
        isOpen={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        theme={theme}
        roomsCount={rooms.length}
      />

      <SettingsModal
        isOpen={isRateModalOpen}
        onOpenChange={setIsRateModalOpen}
        currentTenant={currentTenant}
        setCurrentTenant={setCurrentTenant}
        rooms={rooms}
        theme={theme}
      />

      <CheckInModal 
        isOpen={isCheckInModalOpen}
        onOpenChange={setIsCheckInModalOpen}
        selectedRoomId={selectedRoomId}
        rooms={rooms}
        theme={theme}
        tenantStandardCheckOutTime={currentTenant?.standardCheckOutTime}
      />

      <ManageStayModal 
        selectedBooking={selectedBooking}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
        theme={theme}
      />

    </div>
  );
}
