import { redirect } from 'next/navigation';

/**
 * Dashboard root now opens the BaleyBots command center.
 */
export default function DashboardPage() {
  redirect('/dashboard/baleybots');
}
