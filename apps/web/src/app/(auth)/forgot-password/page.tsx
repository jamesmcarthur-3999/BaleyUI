'use client';

import { Sparkles, ArrowLeft, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-[400px] space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/20">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-gradient">Baley</span>
              <span className="text-foreground">UI</span>
            </span>
          </Link>
        </div>

        {/* Content */}
        <div className="text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <KeyRound className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Reset your password</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Password reset via email is not yet configured. Please contact your
            administrator to reset your password, or sign in and change it from
            your profile settings.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button asChild variant="premium" className="w-full">
            <Link href="/sign-in">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to sign in
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
