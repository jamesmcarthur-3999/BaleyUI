import { redirect } from 'next/navigation';

/**
 * BaleyBots entry route.
 *
 * The command-center experience is now the default BaleyBots view.
 * The previous list/catalog view lives at /dashboard/baleybots/library.
 */
export default function BaleybotsPage() {
  redirect('/dashboard/baleybots/new');
}
