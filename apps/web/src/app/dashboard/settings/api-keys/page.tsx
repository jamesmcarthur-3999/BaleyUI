import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default function ApiKeysRedirect() {
  redirect(ROUTES.capabilities.apiKeys);
}
