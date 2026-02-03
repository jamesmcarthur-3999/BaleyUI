import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  /**
   * Automatically add Dashboard as the first item if not present
   * @default true
   */
  addDashboardHome?: boolean;
}

function getBreadcrumbItems(items: BreadcrumbItem[], addDashboardHome: boolean): BreadcrumbItem[] {
  const firstItem = items[0];
  const hasHomeItem = items.length > 0 && firstItem &&
    (firstItem.href === ROUTES.dashboard ||
     firstItem.href === '/' ||
     firstItem.label.toLowerCase() === 'home' ||
     firstItem.label.toLowerCase() === 'dashboard');

  if (addDashboardHome && !hasHomeItem) {
    return [
      { label: 'Dashboard', href: ROUTES.dashboard },
      ...items,
    ];
  }

  return items;
}

function Breadcrumbs({
  items,
  className,
  addDashboardHome = true,
}: BreadcrumbsProps) {
  // Ensure we have a home/dashboard item at the start
  const breadcrumbItems = getBreadcrumbItems(items, addDashboardHome);

  if (breadcrumbItems.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center space-x-1 text-sm', className)}
    >
      <ol className="flex items-center space-x-1">
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          const isFirst = index === 0;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center">
              {index > 0 && (
                <ChevronRight
                  className="mx-1 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              )}

              {isLast || !item.href ? (
                <span
                  className="font-medium text-foreground"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center text-muted-foreground transition-colors hover:text-foreground',
                    isFirst && 'gap-1'
                  )}
                >
                  {isFirst && <Home className="h-4 w-4" aria-hidden="true" />}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Breadcrumbs };
