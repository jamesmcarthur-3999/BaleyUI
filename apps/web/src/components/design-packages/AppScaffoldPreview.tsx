'use client';

import { useId, useState, useEffect } from 'react';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { packageToCSSString } from '@/lib/design-packages/css-variables';
import { useGoogleFonts } from '@/lib/design-packages/font-loader';
import { cn } from '@/lib/utils';
import {
  Home,
  Users,
  BarChart3,
  Settings,
  Bell,
  Search,
  TrendingUp,
  TrendingDown,
  Plus,
  ChevronRight,
  Layers,
  Zap,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Folder,
  Moon,
  Sun,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────── */

type ScaffoldState = 'placeholder' | 'loading' | 'active';

interface AppScaffoldPreviewProps {
  data?: DesignPackageData | null;
  brandName?: string;
  className?: string;
  state?: ScaffoldState;
}

/* ─── Static Data ───────────────────────────────────────── */

const SIDEBAR_ITEMS = [
  { icon: Home, label: 'Dashboard', active: true },
  { icon: Users, label: 'Customers', badge: '12' },
  { icon: BarChart3, label: 'Analytics' },
  { icon: Folder, label: 'Projects' },
  { icon: Layers, label: 'Integrations' },
  { icon: Settings, label: 'Settings' },
];

const STATS = [
  { label: 'Revenue', value: '$12,450', icon: TrendingUp, trend: 12.5 },
  { label: 'Active Users', value: '1,234', icon: Users, trend: 8.2 },
  { label: 'Conversion', value: '3.2%', icon: Zap, trend: -2.1 },
  { label: 'Open Tasks', value: '45', icon: CheckCircle2, trend: 5.0 },
];

const TABLE_DATA = [
  { name: 'Brand Redesign', status: 'Active', date: 'Feb 13', initials: 'AK', progress: 75 },
  { name: 'API Integration', status: 'Complete', date: 'Feb 12', initials: 'JM', progress: 100 },
  { name: 'User Research', status: 'In Review', date: 'Feb 11', initials: 'SR', progress: 90 },
  { name: 'Mobile App v2', status: 'Active', date: 'Feb 10', initials: 'LD', progress: 45 },
  { name: 'Security Audit', status: 'Pending', date: 'Feb 9', initials: 'TC', progress: 10 },
];

const STATUS_CSS_VAR: Record<string, string> = {
  Active: '--primary',
  Complete: '--color-success',
  'In Review': '--color-warning',
  Pending: '--muted-foreground',
};

const CHART_POINTS = [28, 42, 35, 55, 38, 62, 48, 70, 52, 74, 58, 80];

/* ─── SVG Helpers ───────────────────────────────────────── */

function smoothPath(points: number[], w: number, h: number): string {
  const max = Math.max(...points);
  const pts = points.map((p, i) => ({
    x: (i / (points.length - 1)) * w,
    y: h - (p / max) * h * 0.75 - h * 0.12,
  }));

  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 2] ?? pts[i - 1]!;
    const p1 = pts[i - 1]!;
    const p2 = pts[i]!;
    const p3 = pts[i + 1] ?? p2;
    const t = 0.35;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/* ─── Component ─────────────────────────────────────────── */

export function AppScaffoldPreview({
  data,
  brandName = 'Your App',
  className,
  state: stateProp,
}: AppScaffoldPreviewProps) {
  const uid = useId().replace(/:/g, '');
  const cid = `scaffold-${uid}`;
  const [isDark, setIsDark] = useState(false);

  // Derive state from props if not explicitly set
  const state: ScaffoldState = stateProp ?? (data ? 'active' : 'placeholder');

  useGoogleFonts(data?.typography.googleFontsUrl);

  const css = data ? packageToCSSString(data, cid, isDark ? 'dark' : 'light') : '';
  const fontCss = data?.typography.fontFamily
    ? `#${cid} { font-family: ${data.typography.fontFamily}; }`
    : '';

  // Loading overlay exit animation
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  useEffect(() => {
    if (state === 'loading') {
      setShowLoadingOverlay(true);
    } else if (showLoadingOverlay) {
      const timer = setTimeout(() => setShowLoadingOverlay(false), 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const slug = brandName.toLowerCase().replace(/\s+/g, '');
  const CW = 560;
  const CH = 140;
  const line = smoothPath(CHART_POINTS, CW, CH);
  const area = `${line} L ${CW} ${CH} L 0 ${CH} Z`;
  const lastY =
    CH -
    (CHART_POINTS[CHART_POINTS.length - 1]! / Math.max(...CHART_POINTS)) * CH * 0.75 -
    CH * 0.12;

  const transitionStyles = `
    #${cid},
    #${cid} > div,
    #${cid} header,
    #${cid} aside,
    #${cid} main,
    #${cid} main > div {
      transition: background-color 300ms ease, color 300ms ease, border-color 300ms ease;
    }
    @keyframes scaffold-shimmer {
      0% { opacity: 0.4; }
      50% { opacity: 0.8; }
      100% { opacity: 0.4; }
    }
  `;

  return (
    <div className={cn('relative rounded-2xl shadow-2xl ring-1 ring-black/[0.08] overflow-hidden', className)}>
      <style dangerouslySetInnerHTML={{ __html: css + '\n' + fontCss + '\n' + transitionStyles }} />

      {/* Placeholder overlay */}
      {state === 'placeholder' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-muted/60 backdrop-blur-[2px]">
          <div className="text-center space-y-2 px-8">
            <div className="text-3xl">🎨</div>
            <p className="text-sm font-medium text-muted-foreground">
              Your design preview will appear here
            </p>
          </div>
        </div>
      )}

      {/* Loading overlay with exit animation */}
      {(state === 'loading' || showLoadingOverlay) && (
        <div
          className={cn(
            'absolute inset-0 z-10 rounded-2xl bg-primary/5 backdrop-blur-[1px] transition-opacity duration-300',
            state !== 'loading' && 'opacity-0',
          )}
          style={{ animation: state === 'loading' ? 'scaffold-shimmer 2s ease-in-out infinite' : 'none' }}
        />
      )}

      <div
        id={cid}
        className={cn(
          'transition-colors duration-500',
          isDark ? 'dark' : '',
          state === 'placeholder' && 'grayscale opacity-50',
        )}
        style={{ backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
      >
        {/* ── Browser Chrome ─────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 py-2"
          style={{
            backgroundColor: 'hsl(var(--muted))',
            borderBottom: '1px solid hsl(var(--border))',
          }}
        >
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 mx-6">
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-1 text-[11px]"
              style={{
                backgroundColor: 'hsl(var(--background) / 0.7)',
                color: 'hsl(var(--muted-foreground))',
              }}
            >
              <Shield className="h-3 w-3 shrink-0" style={{ color: 'hsl(var(--color-success))' }} />
              <span className="truncate">https://app.{slug}.com/dashboard</span>
            </div>
          </div>
          <button
            onClick={() => setIsDark((d) => !d)}
            className="rounded-md p-1 transition-colors hover:opacity-80"
            style={{ color: 'hsl(var(--muted-foreground))' }}
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* ── App Header ─────────────────────────────── */}
        <header
          className="flex items-center justify-between px-5 py-2"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center"
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  borderRadius: `calc(var(--radius) * 0.6)`,
                }}
              >
                <Zap className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold tracking-tight">{brandName}</span>
            </div>
            <nav className="flex items-center gap-0.5">
              {['Dashboard', 'Customers', 'Analytics'].map((item, i) => (
                <span
                  key={item}
                  className="cursor-default px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    borderRadius: 'var(--radius)',
                    ...(i === 0
                      ? {
                          backgroundColor: 'hsl(var(--primary) / 0.08)',
                          color: 'hsl(var(--primary))',
                        }
                      : { color: 'hsl(var(--muted-foreground))' }),
                  }}
                >
                  {item}
                </span>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search
                className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              />
              <input
                className="h-7 w-36 pl-7 pr-2 text-[11px] outline-none"
                placeholder="Search..."
                style={{
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'hsl(var(--muted) / 0.6)',
                  color: 'hsl(var(--foreground))',
                }}
                readOnly
              />
            </div>
            <div className="relative cursor-default" style={{ color: 'hsl(var(--muted-foreground))' }}>
              <Bell className="h-4 w-4" />
              <span
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-bold"
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                }}
              >
                3
              </span>
            </div>
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                backgroundColor: 'hsl(var(--primary) / 0.12)',
                color: 'hsl(var(--primary))',
              }}
            >
              A
            </div>
          </div>
        </header>

        {/* ── Body: Sidebar + Main ───────────────────── */}
        <div className="flex">
          {/* Sidebar */}
          <aside
            className="w-44 shrink-0 space-y-0.5 p-2.5"
            style={{ borderRight: '1px solid hsl(var(--border))' }}
          >
            {SIDEBAR_ITEMS.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 px-2.5 py-[7px] text-[11px] font-medium cursor-default"
                style={{
                  borderRadius: 'var(--radius)',
                  ...(item.active
                    ? {
                        backgroundColor: 'hsl(var(--primary) / 0.08)',
                        color: 'hsl(var(--primary))',
                      }
                    : { color: 'hsl(var(--muted-foreground))' }),
                }}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span
                    className="rounded-full px-1.5 py-px text-[9px] font-semibold"
                    style={{
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                      color: 'hsl(var(--primary))',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            ))}
          </aside>

          {/* Main Content */}
          <main className="flex-1 space-y-5 p-5">
            {/* ─ Welcome ─ */}
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-base font-semibold tracking-tight">Good afternoon, Alex</h1>
                <p className="mt-0.5 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Here&apos;s your overview for today
                </p>
              </div>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium"
                style={{
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                }}
              >
                <Plus className="h-3 w-3" />
                New Project
              </button>
            </div>

            {/* ─ Stat Cards ─ */}
            <div className="grid grid-cols-4 gap-3">
              {STATS.map((s) => {
                const positive = s.trend > 0;
                return (
                  <div
                    key={s.label}
                    className="space-y-2 p-3.5"
                    style={{
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[10px] font-medium uppercase tracking-wider"
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {s.label}
                      </span>
                      <s.icon className="h-3.5 w-3.5" style={{ color: 'hsl(var(--muted-foreground))' }} />
                    </div>
                    <div className="text-xl font-bold tabular-nums">{s.value}</div>
                    <div className="flex items-center gap-1 text-[10px]">
                      {positive ? (
                        <TrendingUp
                          className="h-3 w-3"
                          style={{ color: 'hsl(var(--color-success))' }}
                        />
                      ) : (
                        <TrendingDown
                          className="h-3 w-3"
                          style={{ color: 'hsl(var(--color-error))' }}
                        />
                      )}
                      <span
                        style={{
                          color: positive
                            ? 'hsl(var(--color-success))'
                            : 'hsl(var(--color-error))',
                        }}
                      >
                        {positive ? '+' : ''}
                        {s.trend}%
                      </span>
                      <span style={{ color: 'hsl(var(--muted-foreground))' }}>vs last month</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ─ Chart ─ */}
            <div
              className="p-4"
              style={{
                borderRadius: 'var(--radius)',
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold">Revenue Overview</h3>
                  <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Last 12 weeks
                  </span>
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: 'hsl(var(--color-success) / 0.1)',
                    color: 'hsl(var(--color-success))',
                  }}
                >
                  <TrendingUp className="h-2.5 w-2.5" />
                  +18.2%
                </span>
              </div>
              <svg
                viewBox={`0 0 ${CW} ${CH}`}
                className="w-full"
                style={{ height: 120 }}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((r) => (
                  <line
                    key={r}
                    x1="0"
                    y1={CH * r}
                    x2={CW}
                    y2={CH * r}
                    stroke="hsl(var(--border))"
                    strokeWidth="0.8"
                    strokeDasharray="4 4"
                    opacity="0.5"
                  />
                ))}
                <path d={area} fill={`url(#g-${uid})`} />
                <path
                  d={line}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={CW} cy={lastY} r="3.5" fill="hsl(var(--primary))" />
                <circle cx={CW} cy={lastY} r="6" fill="hsl(var(--primary))" opacity="0.2" />
              </svg>
            </div>

            {/* ─ Table ─ */}
            <div
              className="overflow-hidden"
              style={{
                borderRadius: 'var(--radius)',
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-xs font-semibold">Recent Activity</h3>
                <button
                  className="flex items-center gap-0.5 text-[10px] font-medium"
                  style={{ color: 'hsl(var(--primary))' }}
                >
                  View all
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr
                    style={{
                      backgroundColor: 'hsl(var(--muted) / 0.4)',
                      borderTop: '1px solid hsl(var(--border))',
                    }}
                  >
                    {['Project', 'Status', 'Date', 'Assignee', 'Progress'].map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          'px-4 py-2 font-medium',
                          i === 4 ? 'text-right' : 'text-left'
                        )}
                        style={{ color: 'hsl(var(--muted-foreground))' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TABLE_DATA.map((row, i) => {
                    const cssVar = STATUS_CSS_VAR[row.status] ?? '--muted-foreground';
                    return (
                      <tr key={i} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                        <td className="px-4 py-2.5 font-medium">{row.name}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-px text-[9px] font-semibold"
                            style={{
                              backgroundColor: `hsl(var(${cssVar}) / 0.1)`,
                              color: `hsl(var(${cssVar}))`,
                            }}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                          {row.date}
                        </td>
                        <td className="px-4 py-2.5">
                          <div
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-semibold"
                            style={{
                              backgroundColor: 'hsl(var(--primary) / 0.1)',
                              color: 'hsl(var(--primary))',
                            }}
                          >
                            {row.initials}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div
                              className="h-1.5 w-14 overflow-hidden rounded-full"
                              style={{ backgroundColor: 'hsl(var(--muted))' }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${row.progress}%`,
                                  backgroundColor: `hsl(var(${cssVar}))`,
                                }}
                              />
                            </div>
                            <span
                              className="w-7 text-right tabular-nums"
                              style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                              {row.progress}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ─ Quick Action Form ─ */}
            <div
              className="p-4"
              style={{
                borderRadius: 'var(--radius)',
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
              }}
            >
              <h3 className="mb-3 text-xs font-semibold">Quick Action</h3>
              <div className="flex gap-2.5">
                <input
                  className="h-8 flex-1 px-3 text-[11px] outline-none"
                  placeholder="Project name"
                  readOnly
                  style={{
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--input))',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <select
                  className="h-8 appearance-none px-3 text-[11px] outline-none"
                  style={{
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--input))',
                    color: 'hsl(var(--muted-foreground))',
                  }}
                >
                  <option>Category</option>
                </select>
                <button
                  className="flex h-8 items-center gap-1.5 px-3.5 text-[11px] font-medium"
                  style={{
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'hsl(var(--primary))',
                    color: 'hsl(var(--primary-foreground))',
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Create
                </button>
              </div>
            </div>

            {/* ─ Notification Alerts ─ */}
            <div className="space-y-2">
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 text-[11px]"
                style={{
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'hsl(var(--color-success) / 0.06)',
                  border: '1px solid hsl(var(--color-success) / 0.15)',
                }}
              >
                <CheckCircle2
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'hsl(var(--color-success))' }}
                />
                <span>Deployment completed successfully — all systems operational</span>
              </div>
              <div
                className="flex items-center gap-2.5 px-4 py-2.5 text-[11px]"
                style={{
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'hsl(var(--color-warning) / 0.06)',
                  border: '1px solid hsl(var(--color-warning) / 0.15)',
                }}
              >
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'hsl(var(--color-warning))' }}
                />
                <span>API rate limit approaching (85%) — consider upgrading your plan</span>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
