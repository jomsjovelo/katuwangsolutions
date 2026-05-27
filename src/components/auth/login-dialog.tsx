'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  signInWithEmailAndPassword, 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup 
} from 'firebase/auth';
import { app } from '@/firebase/config';
import { FirebaseError } from 'firebase/app';
import { Loader2, LogIn, Chrome } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';

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

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setAuthError(null);
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, data.email, data.password);
      setOpen(false);
      form.reset();
    } catch (error) {
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
        setAuthError('Network error. Please check your connection.');
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsGoogleLoading(true);
      setAuthError(null);
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setOpen(false);
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        setAuthError('Failed to sign in with Google. Please try again.');
      }
    } finally {
      setIsGoogleLoading(false);
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
                      className="h-12 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-primary focus-visible:ring-offset-2" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-xs font-bold" />
                </FormItem>
              )}
            />
            
            <div className="pt-4 space-y-4">
              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl text-base font-bold shadow-lg hover:shadow-xl transition-all joy-glow active:scale-95 flex items-center justify-center gap-2"
                disabled={form.formState.isSubmitting || isGoogleLoading}
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

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                  <span className="bg-white px-2 text-slate-400">O kaya ay</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                className="w-full h-14 rounded-xl text-base font-bold border-slate-200 hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                disabled={form.formState.isSubmitting || isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Chrome className="h-5 w-5 text-[#4285F4]" />
                    Gamitin ang Google
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

