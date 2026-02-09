import { redirect } from 'next/navigation';

/**
 * Legacy alias retained for backward compatibility.
 */
export default function BaleybotsLibraryPage() {
  redirect('/dashboard/baleybots');
}
