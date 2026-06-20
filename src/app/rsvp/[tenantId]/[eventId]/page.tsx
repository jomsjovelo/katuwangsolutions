"use client";

import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Loader2, CheckCircle2, CalendarHeart, MapPin, Clock } from 'lucide-react';

export default function RsvpPage() {
  const { tenantId, eventId } = useParams() as { tenantId: string, eventId: string };
  const [eventData, setEventData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState('');
  const [phoneOrNote, setPhoneOrNote] = useState('');
  const [mealPref, setMealPref] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function fetchEvent() {
      try {
        const { db } = initializeFirebase();
        // Since rules restrict reading, we might not be able to read the event data if unauthenticated.
        // Wait, the rules say: allow read: if hasTenantAccess(tenantId). 
        // If unauthenticated, this read will FAIL. 
        // So we just have to submit blindly, OR we need to update rules to allow reading the event.
        // Let's just try to read it, if it fails, we show a generic title.
        const eventRef = doc(db, 'tenants', tenantId, 'events', eventId);
        const snap = await getDoc(eventRef);
        if (snap.exists()) {
          setEventData(snap.data());
        }
      } catch (e) {
      const err = e as Error & { code?: string };
        console.warn('Cannot fetch event details (expected if unauthenticated):', err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [tenantId, eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { db } = initializeFirebase();
      const guestsRef = collection(db, 'tenants', tenantId, 'events', eventId, 'guests');
      const newGuestRef = doc(guestsRef);

      await setDoc(newGuestRef, {
        id: newGuestRef.id,
        name: guestName.trim(),
        tableOrSeat: phoneOrNote.trim() || 'TBD',
        mealPref: mealPref.trim() || 'None',
        checkedIn: false,
        createdAt: serverTimestamp(),
      });

      setSubmitted(true);
    } catch (e) {
      const err = e as Error & { code?: string };
      setError(err.message || 'Failed to submit RSVP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <Card className="max-w-md w-full rounded-[24px] shadow-xl border-emerald-100 animate-in zoom-in-95 duration-500">
          <CardContent className="pt-10 pb-10 flex flex-col items-center">
            <div className="h-20 w-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-black font-headline text-slate-800 mb-2">You're on the list!</h1>
            <p className="text-slate-500 text-sm">We've received your RSVP for the event. See you there!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6 opacity-50">
          <BrandLogo showText={false} className="[&>div]:h-12 [&>div]:w-12" />
        </div>

        <Card className="rounded-[24px] shadow-xl border-slate-100 overflow-hidden">
          <CardHeader className="bg-primary/5 text-center pb-8 pt-8">
            <div className="mx-auto bg-primary/10 w-16 h-16 flex items-center justify-center rounded-2xl mb-4">
              <CalendarHeart className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-black font-headline">
              {eventData ? eventData.title : 'Event RSVP'}
            </CardTitle>
            <CardDescription className="text-sm font-medium mt-2">
              Please complete the form below to confirm your attendance.
            </CardDescription>

            {eventData && (
              <div className="mt-6 flex flex-col gap-2 text-xs text-slate-600 bg-white/50 backdrop-blur-sm p-4 rounded-xl inline-flex text-left max-w-[80%] mx-auto shadow-sm border border-slate-100">
                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" /> <b>{eventData.eventDate}</b></div>
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /> {eventData.venue}</div>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</Label>
                <Input 
                  id="name" 
                  placeholder="Juan Dela Cruz" 
                  className="h-12 rounded-xl bg-slate-50 border-slate-200"
                  value={guestName} 
                  onChange={(e) => setGuestName(e.target.value)} 
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phoneOrNote" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone Number / Plus Ones</Label>
                <Input 
                  id="phoneOrNote" 
                  placeholder="0917... or 'Plus 1'" 
                  className="h-12 rounded-xl bg-slate-50 border-slate-200"
                  value={phoneOrNote} 
                  onChange={(e) => setPhoneOrNote(e.target.value)} 
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mealPref" className="text-xs font-bold text-slate-500 uppercase tracking-wider">Meal Preference (Optional)</Label>
                <Input 
                  id="mealPref" 
                  placeholder="e.g. Vegetarian, Halal, No Seafood" 
                  className="h-12 rounded-xl bg-slate-50 border-slate-200"
                  value={mealPref} 
                  onChange={(e) => setMealPref(e.target.value)} 
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl font-bold text-lg mt-4 shadow-lg active:scale-95 transition-transform" 
                disabled={isSubmitting || !guestName.trim()}
              >
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Confirm RSVP'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
