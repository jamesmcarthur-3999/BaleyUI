'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface BreadcrumbContextValue {
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);

  return (
    <BreadcrumbContext.Provider value={{ breadcrumbs, setBreadcrumbs }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbContext);
  if (!context) {
    throw new Error('useBreadcrumbs must be used within BreadcrumbProvider');
  }
  return context;
}

/**
 * Component to set breadcrumbs from within a page.
 * Automatically cleans up when unmounted.
 */
export function SetBreadcrumbs({ items }: { items: Breadcrumb[] }) {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs(items);
    return () => setBreadcrumbs([]);
  }, [items, setBreadcrumbs]);

  return null;
}

export type { Breadcrumb };
