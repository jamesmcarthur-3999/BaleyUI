import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect(ROUTES.auth.signIn);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5" />
      <div
        className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, hsl(262 83% 58% / 0.1) 0%, transparent 55%)' }}
      />
      <div className="absolute inset-0 noise pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 w-full flex items-center justify-center py-12">
        {children}
      </div>
    </div>
  );
}
