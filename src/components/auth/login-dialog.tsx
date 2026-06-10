'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { FirebaseError } from 'firebase/app';
import { Loader2, LogIn } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useSearchParams } from 'next/navigation';

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
import { Separator } from '@/components/ui/separator';

import { loginOrRegisterStaff } from '@/firebase/firestore/staff-actions';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  businessCode: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginDialog({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code');
  const [open, setOpen] = useState(!!initialCode);
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      businessCode: initialCode || '',
    },
  });

  useEffect(() => {
    if (initialCode) {
      setOpen(true);
      form.setValue('businessCode', initialCode);
    }
  }, [initialCode, form]);

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setAuthError(null);
      await loginOrRegisterStaff(data.email, data.password, data.businessCode);
      setOpen(false);
      form.reset();
    } catch (error: any) {
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/invalid-credential':
            setAuthError('Invalid email or password.');
            break;
          case 'auth/too-many-requests':
            setAuthError('Too many failed attempts. Please try again later.');
            break;
          default:
            setAuthError('An error occurred during login.');
        }
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
              Magsimula Na
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium mt-1">
              I-enter ang inyong account details upang makapasok sa Katuwang Environment.
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
                        autoComplete="current-password"
                        className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage className="text-xs font-bold" />
                  </FormItem>
                )}
              />

              <div className="pt-2">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-slate-400 font-bold">Kung ikaw ay Katuwang / Team Member</span>
                  </div>
                </div>
              </div>

              <FormField
                control={form.control}
                name="businessCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-bold uppercase tracking-widest text-slate-400">Business Code (Optional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Halimbawa: 8391" 
                        className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2 text-center text-lg font-bold tracking-[0.2em]" 
                        maxLength={4}
                        {...field} 
                      />
                    </FormControl>
                    <p className="text-[10px] text-slate-500 font-medium leading-tight">Ilagay ang 4-digit code ng iyong negosyo para maka-join. Iwanang blangko kung ikaw ang may-ari.</p>
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
                    <LogIn className="h-5 w-5" />
                    Mag-Login
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

