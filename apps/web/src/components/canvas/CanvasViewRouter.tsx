'use client';

import dynamic from 'next/dynamic';
import { useCanvasStore } from '@/stores/canvas';
import { WelcomeView } from './views/WelcomeView';

// Lazy-load heavy views
const PlanView = dynamic(
  () => import('./views/PlanView').then(mod => ({ default: mod.PlanView })),
  {
    ssr: false,
    loading: () => <ViewSkeleton label="Loading plan..." />,
  },
);

const BrandDesignView = dynamic(
  () => import('./views/BrandDesignView').then(mod => ({ default: mod.BrandDesignView })),
  {
    ssr: false,
    loading: () => <ViewSkeleton label="Loading brand studio..." />,
  },
);

const LiveAppView = dynamic(
  () => import('./views/LiveAppView').then(mod => ({ default: mod.LiveAppView })),
  {
    ssr: false,
    loading: () => <ViewSkeleton label="Preparing live preview..." />,
  },
);

const DeployView = dynamic(
  () => import('./views/DeployView').then(mod => ({ default: mod.DeployView })),
  {
    ssr: false,
    loading: () => <ViewSkeleton label="Loading deploy options..." />,
  },
);

function ViewSkeleton({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center bg-muted/10 rounded-xl">
      <span className="text-sm text-muted-foreground animate-pulse">{label}</span>
    </div>
  );
}

interface CanvasViewRouterProps {
  onSendMessage: (message: string) => void;
}

export function CanvasViewRouter({ onSendMessage }: CanvasViewRouterProps) {
  const view = useCanvasStore((s) => s.view);

  switch (view.kind) {
    case 'welcome':
      return <WelcomeView onSendMessage={onSendMessage} />;

    case 'plan':
      return <PlanView plan={view.plan} onSendMessage={onSendMessage} />;

    case 'brand':
      return <BrandDesignView />;

    case 'live':
      return <LiveAppView />;

    case 'deploy':
      return <DeployView />;

    default:
      return <WelcomeView onSendMessage={onSendMessage} />;
  }
}
