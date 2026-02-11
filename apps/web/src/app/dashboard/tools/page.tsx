import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default function ToolsRedirect() {
  redirect(ROUTES.capabilities.tools);
}
