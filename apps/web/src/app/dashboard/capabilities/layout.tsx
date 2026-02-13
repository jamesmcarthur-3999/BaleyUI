import { CapabilitiesNav } from '@/components/capabilities/CapabilitiesNav';

export default function CapabilitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container py-10">
      <div className="mb-2">
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="mt-2 text-muted-foreground mb-6">
          The tools, connections, and API keys that power your BaleyBots
        </p>
      </div>
      <CapabilitiesNav />
      {children}
    </div>
  );
}
