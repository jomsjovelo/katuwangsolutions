'use client';

import React, { useState, useEffect } from 'react';
import { useTenant } from '@/app/lib/tenant-context';
import { addSupplier, updateSupplier } from '@/firebase/firestore/supplier-actions';
import { SupplierProfile } from '@/lib/schemas/supplier';
import { getModuleTheme } from '@/lib/theme-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import { Loader2, Truck, Save, Building2, User, Phone, MapPin, CreditCard } from 'lucide-react';

interface SupplierManagerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  supplierToEdit?: SupplierProfile | null;
}

export function SupplierManagerSheet({ isOpen, onClose, supplierToEdit }: SupplierManagerSheetProps) {
  const { currentTenant } = useTenant();
  const theme = getModuleTheme(currentTenant?.moduleType);

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<'cash' | 'credit_15' | 'credit_30' | 'credit_60'>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (supplierToEdit) {
      setName(supplierToEdit.name || '');
      setContactPerson(supplierToEdit.contactPerson || '');
      setPhone(supplierToEdit.phone || '');
      setAddress(supplierToEdit.address || '');
      setPaymentTerms(supplierToEdit.paymentTerms || 'cash');
      setNotes(supplierToEdit.notes || '');
    } else {
      setName('');
      setContactPerson('');
      setPhone('');
      setAddress('');
      setPaymentTerms('cash');
      setNotes('');
    }
  }, [supplierToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !name.trim()) return;

    try {
      setSaving(true);
      const data: Partial<SupplierProfile> = {
        name: name.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        address: address.trim(),
        paymentTerms,
        notes: notes.trim(),
      };

      if (supplierToEdit?.id) {
        await updateSupplier(currentTenant.id, supplierToEdit.id, data);
      } else {
        await addSupplier(currentTenant.id, data);
      }

      onClose();
    } catch (err) {
      console.error(err);
      alert("May error sa pag-save ng supplier profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-white p-6 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-50 text-cyan-700">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-base font-black text-slate-900">
                {supplierToEdit ? 'I-edit ang Supplier' : 'Magdagdag ng Supplier'}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-500">
                I-manage ang suki vendors, contact info, at payment terms.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              Pangalan ng Supplier / Tindahan *
            </Label>
            <Input 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mang Jose Divisoria Onions"
              required
              className="rounded-xl border-slate-200 text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                Contact Person
              </Label>
              <Input 
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Jose Santos"
                className="rounded-xl border-slate-200 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                Phone Number
              </Label>
              <Input 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0917XXXXXXX"
                className="rounded-xl border-slate-200 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              Lokasyon / Palengke Stall
            </Label>
            <Input 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Stall #14, Divisoria Bagsakan"
              className="rounded-xl border-slate-200 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5 text-slate-400" />
              Default Payment Terms
            </Label>
            <select
              value={paymentTerms}
              onChange={(e: any) => setPaymentTerms(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-bold text-slate-800"
            >
              <option value="cash">💵 Cash / Instant Payment</option>
              <option value="credit_15">💳 15-Day Supplier Credit</option>
              <option value="credit_30">💳 30-Day Supplier Credit</option>
              <option value="credit_60">💳 60-Day Supplier Credit</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Notes / Remarks</Label>
            <Textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mga paalala tungkol sa supplier na ito..."
              className="rounded-xl border-slate-200 text-sm min-h-[80px]"
            />
          </div>

          <SheetFooter className="pt-4 border-t border-slate-100 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 rounded-xl text-xs font-bold"
            >
              Kanselahin
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-xl text-xs font-black text-white bg-cyan-600 hover:bg-cyan-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Supplier
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
