import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default function ConnectionsRedirect() {
  redirect(ROUTES.capabilities.connections);
}
