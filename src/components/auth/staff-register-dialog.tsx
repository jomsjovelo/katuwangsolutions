'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { FirebaseError } from 'firebase/app';
import { Loader2, UserPlus } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSearchParams, useRouter } from 'next/navigation';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { registerStaff } from '@/firebase/firestore/staff-actions';

const staffRegisterSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  businessCode: z.string().min(7, 'Business code must be exactly 7 characters').max(7, 'Business code must be exactly 7 characters'),
  fullName: z.string().min(2, 'Kailangan ang buong pangalan mo'),
  birthday: z.string().min(1, 'Kailangan ang birthday mo').refine(val => {
    const today = new Date();
    const birthDate = new Date(val);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 18;
  }, { message: 'Kailangan ay 18 years old pataas upang makapag-register.' }),
  gender: z.enum(['Lalaki', 'Babae', 'Iba pa', 'Prefer not to say']),
  address: z.string().min(5, 'Kailangan ng kumpletong address'),
});

type StaffRegisterFormValues = z.infer<typeof staffRegisterSchema>;

export function StaffRegisterDialog({ children }: { children?: React.ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasCodeParam = searchParams.has('code');
  const initialCode = searchParams.get('code') || '';
  
  // We ONLY open this dialog if the URL has ?code= (even if empty)
  const [open, setOpen] = useState(hasCodeParam);
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm<StaffRegisterFormValues>({
    resolver: zodResolver(staffRegisterSchema),
    defaultValues: {
      email: '',
      password: '',
      businessCode: initialCode || '',
      fullName: '',
      birthday: '',
      gender: 'Prefer not to say',
      address: '',
    },
  });

  useEffect(() => {
    if (hasCodeParam) {
      setOpen(true);
      if (initialCode) {
        form.setValue('businessCode', initialCode);
      }
      // Immediately clear the code from the URL to prevent phantom links on refresh
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/');
      }
    }
  }, [hasCodeParam, initialCode, form]);

  const onSubmit = async (data: StaffRegisterFormValues) => {
    try {
      setAuthError(null);
      await registerStaff(
        data.email, 
        data.password, 
        data.businessCode,
        data.fullName,
        data.birthday,
        data.gender,
        data.address
      );
      
      // Force a hard navigation to dashboard to guarantee AuthGuard sees the clean persisted auth state
      window.location.href = '/dashboard';
    } catch (error: any) {
      if (error instanceof FirebaseError) {
        setAuthError(error.message);
      } else {
        setAuthError(error.message || 'Network error. Please check your connection.');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md rounded-[24px] p-6 border-slate-100">
        <DialogHeader className="flex flex-col items-center text-center space-y-4 mb-6">
          <div className="p-3 bg-primary/5 rounded-full">
            <BrandLogo showText={false} className="!h-10 !w-10 sm:!h-12 sm:!w-12" />
          </div>
          <div>
            <DialogTitle className="text-2xl font-black font-headline uppercase tracking-tight">
              Join Store Team
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium mt-1">
              Create your staff account to join the store.
            </DialogDescription>
          </div>
        </DialogHeader>

        {authError && (
          <Alert variant="destructive" className="mb-4 bg-destructive/10 border-none">
            <AlertDescription className="font-bold text-center">
              {authError}
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Buong Pangalan</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Halimbawa: Juan dela Cruz" 
                      className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-xs font-bold" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="birthday"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Birthday (18+)</FormLabel>
                    <FormControl>
                      <Input 
                        type="date"
                        className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="text-[10px] font-bold" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Gender</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2">
                          <SelectValue placeholder="Pumili..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Lalaki">Lalaki</SelectItem>
                        <SelectItem value="Babae">Babae</SelectItem>
                        <SelectItem value="Iba pa">Iba pa</SelectItem>
                        <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-[10px] font-bold" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Kumpletong Address</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="House No., Street, Brgy., City, Province" 
                      className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-[10px] font-bold" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Email Address</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="pangalan@negosyo.com" 
                      autoComplete="email"
                      className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-xs font-bold" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Password</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      autoComplete="new-password"
                      className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-xs font-bold" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="businessCode"
              render={({ field }) => (
                <FormItem className={initialCode ? "hidden" : ""}>
                  <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Business Code</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Halimbawa: A4X9BQ2" 
                      className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2 text-center text-lg font-bold tracking-[0.2em] uppercase" 
                      maxLength={7}
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  {!initialCode && (
                     <p className="text-[10px] text-slate-500 font-medium leading-tight">Hingin ang 7-character code sa inyong Store Owner.</p>
                  )}
                  <FormMessage className="text-xs font-bold" />
                </FormItem>
              )}
            />
            
            <div className="pt-4 space-y-4">
              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl text-base font-bold shadow-lg hover:shadow-xl transition-all joy-glow active:scale-95 flex items-center justify-center gap-2"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="h-5 w-5" />
                    Register as Staff
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
