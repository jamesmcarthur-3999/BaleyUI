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
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      {children}
    </div>
  );
}
