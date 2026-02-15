'use client';

import { useEffect, useId, useState } from 'react';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { packageToCSSString } from '@/lib/design-packages/css-variables';
import { useGoogleFonts } from '@/lib/design-packages/font-loader';
import { cn } from '@/lib/utils';
import {
  Bell,
  Blocks,
  ChartColumnIncreasing,
  CheckCircle2,
  Layers,
  LayoutDashboard,
  Moon,
  Shield,
  Sparkles,
  Sun,
  Users,
  WandSparkles,
} from 'lucide-react';

type ScaffoldState = 'placeholder' | 'loading' | 'active';

interface AppScaffoldPreviewProps {
  data?: DesignPackageData | null;
  brandName?: string;
  className?: string;
  state?: ScaffoldState;
  surface?: 'landing' | 'customerApp' | 'internalApp';
  containerRef?: (el: HTMLDivElement | null) => void;
}

function sectionGlyph(sectionId: string) {
  const id = sectionId.toLowerCase();
  if (id.includes('hero') || id.includes('feature')) return Sparkles;
  if (id.includes('nav') || id.includes('sidebar')) return LayoutDashboard;
  if (id.includes('table') || id.includes('queue')) return ChartColumnIncreasing;
  if (id.includes('proof') || id.includes('customer')) return Users;
  if (id.includes('detail') || id.includes('panel')) return Layers;
  return Blocks;
}

function densityClass(density: 'compact' | 'comfortable' | 'spacious'): string {
  if (density === 'compact') return 'p-2.5';
  if (density === 'spacious') return 'p-5';
  return 'p-4';
}

function motionClass(intensity: 'subtle' | 'moderate' | 'expressive'): string {
  if (intensity === 'subtle') return 'transition-all duration-300';
  if (intensity === 'expressive') return 'transition-all duration-700';
  return 'transition-all duration-500';
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}...`;
}

export function AppScaffoldPreview({
  data,
  brandName = 'Your App',
  className,
  state: stateProp,
  surface = 'customerApp',
  containerRef,
}: AppScaffoldPreviewProps) {
  const uid = useId().replace(/:/g, '');
  const cid = `scaffold-${uid}`;
  const [isDark, setIsDark] = useState(false);

  const state: ScaffoldState = stateProp ?? (data ? 'active' : 'placeholder');
  useGoogleFonts(data?.typography.googleFontsUrl);

  const css = data ? packageToCSSString(data, cid, isDark ? 'dark' : 'light') : '';
  const fontCss = data?.typography.fontFamily
    ? `#${cid} { font-family: ${data.typography.fontFamily}; }`
    : '';

  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  useEffect(() => {
    if (state === 'loading') {
      setShowLoadingOverlay(true);
    } else if (showLoadingOverlay) {
      const timer = setTimeout(() => setShowLoadingOverlay(false), 250);
      return () => clearTimeout(timer);
    }
  }, [showLoadingOverlay, state]);

  if (state === 'placeholder') {
    return (
      <div className={cn('relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/[0.08]', className)}>
        <div className="relative bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.16),transparent_45%),radial-gradient(circle_at_80%_80%,hsl(var(--accent)/0.12),transparent_40%),hsl(var(--muted)/0.35)] px-8 py-28 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
            <WandSparkles className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Brand transformation preview appears here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Run calibration to generate landing, customer app, and internal app directions.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const blueprint = data.surfaceBlueprints?.[surface] ?? {
    purpose: 'Blueprint data unavailable for this surface.',
    layoutSummary: 'Run calibration to generate structured blueprint sections.',
    sectionOrder: [
      {
        id: 'core-surface',
        title: 'Core Surface',
        description: 'Primary workspace section',
        priority: 1,
        components: ['Card'],
        interactionNotes: ['Keep hierarchy clear and concise'],
      },
      {
        id: 'supporting-surface',
        title: 'Supporting Surface',
        description: 'Secondary context section',
        priority: 2,
        components: ['List'],
        interactionNotes: ['Use semantic spacing and contrast'],
      },
      {
        id: 'actions-surface',
        title: 'Actions Surface',
        description: 'Actions and controls section',
        priority: 3,
        components: ['ButtonGroup'],
        interactionNotes: ['Prioritize clear call-to-action affordances'],
      },
    ],
    animationGuidelines: ['Prefer subtle transitions'],
    samplePrompt: 'Generate a coherent product surface from available design tokens.',
  };
  const density = data.layoutSystem?.density ?? 'comfortable';
  const motion = data.motionSystem?.intensity ?? 'moderate';
  const transitionClass = motionClass(motion);
  const blockClass = densityClass(density);

  const transitionStyles = `
    #${cid},
    #${cid} * {
      transition: background-color 260ms ease, border-color 260ms ease, color 260ms ease, transform 260ms ease;
    }
    #${cid} .surface-block:hover {
      transform: translateY(-2px);
    }
    @media (prefers-reduced-motion: reduce) {
      #${cid},
      #${cid} * {
        transition: none !important;
        animation: none !important;
      }
      #${cid} .surface-block:hover {
        transform: none !important;
      }
    }
    @keyframes scaffold-pulse {
      0% { opacity: 0.35; }
      50% { opacity: 0.7; }
      100% { opacity: 0.35; }
    }
  `;

  const navItems = blueprint.sectionOrder.slice(0, 4).map((section) => section.title);

  return (
    <div className={cn('relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/[0.08]', className)}>
      <style dangerouslySetInnerHTML={{ __html: css + '\n' + fontCss + '\n' + transitionStyles }} />

      {(state === 'loading' || showLoadingOverlay) && (
        <div
          className={cn(
            'absolute inset-0 z-10 rounded-2xl bg-primary/5 backdrop-blur-[1px] transition-opacity duration-300',
            state !== 'loading' && 'opacity-0'
          )}
          style={{ animation: state === 'loading' ? 'scaffold-pulse 2s ease-in-out infinite' : 'none' }}
        />
      )}

      <div
        id={cid}
        ref={containerRef}
        className={cn(isDark && 'dark')}
        style={{ backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
      >
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
          <div
            className="mx-3 flex h-6 flex-1 items-center rounded-lg px-3 text-[11px]"
            style={{
              backgroundColor: 'hsl(var(--background) / 0.72)',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            <Shield className="mr-1.5 h-3 w-3" style={{ color: 'hsl(var(--color-success))' }} />
            {surface === 'landing' ? 'https://brand.site' : `https://app.${brandName.toLowerCase().replace(/\s+/g, '')}.com`}
          </div>
          <button
            onClick={() => setIsDark((prev) => !prev)}
            className="rounded-md p-1"
            style={{ color: 'hsl(var(--muted-foreground))' }}
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        <header
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid hsl(var(--border))' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center"
              style={{
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                borderRadius: 'calc(var(--radius) * 0.7)',
              }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{brandName}</p>
              <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                {surface === 'landing' ? 'Landing Surface' : surface === 'customerApp' ? 'Customer App Surface' : 'Internal App Surface'}
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item, index) => (
              <span
                key={item}
                className="rounded-md px-2 py-1 text-[10px] font-medium"
                style={
                  index === 0
                    ? {
                        backgroundColor: 'hsl(var(--primary) / 0.12)',
                        color: 'hsl(var(--primary))',
                      }
                    : { color: 'hsl(var(--muted-foreground))' }
                }
              >
                {item}
              </span>
            ))}
          </div>
          <div className="relative">
            <Bell className="h-4 w-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
            <span
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            />
          </div>
        </header>

        {surface === 'landing' ? (
          <main className="space-y-4 p-4 md:p-5">
            <section
              className={cn('relative overflow-hidden rounded-xl border', transitionClass)}
              style={{
                borderColor: 'hsl(var(--border))',
                background:
                  'radial-gradient(circle at 10% 10%, hsl(var(--primary) / 0.22), transparent 42%), radial-gradient(circle at 90% 75%, hsl(var(--accent) / 0.18), transparent 45%), hsl(var(--card))',
              }}
            >
              <div className="px-5 py-6 md:px-7 md:py-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'hsl(var(--primary))' }}>
                  {truncate(data.foundation?.brandPersonality ?? 'Brand-aligned design system', 52)}
                </p>
                <h1 className="mt-2 max-w-2xl text-2xl font-semibold leading-tight">
                  {truncate(blueprint.purpose, 90)}
                </h1>
                <p className="mt-2 max-w-xl text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {truncate(blueprint.layoutSummary, 130)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="rounded-md px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: 'hsl(var(--primary))',
                      color: 'hsl(var(--primary-foreground))',
                    }}
                  >
                    Start Free Trial
                  </button>
                  <button
                    className="rounded-md border px-3 py-1.5 text-xs font-medium"
                    style={{
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    View Demo
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-3 md:grid-cols-3">
              {blueprint.sectionOrder.map((section) => {
                const Glyph = sectionGlyph(section.id);
                return (
                  <article
                    key={section.id}
                    className={cn('surface-block rounded-xl border bg-card', blockClass, transitionClass)}
                    style={{ borderColor: 'hsl(var(--border))' }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-md"
                        style={{
                          backgroundColor: 'hsl(var(--primary) / 0.12)',
                          color: 'hsl(var(--primary))',
                        }}
                      >
                        <Glyph className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Priority {section.priority}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{section.title}</p>
                    <p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {truncate(section.description, 85)}
                    </p>
                  </article>
                );
              })}
            </section>
          </main>
        ) : (
          <div className="flex">
            <aside
              className="hidden w-48 shrink-0 space-y-1.5 border-r p-3 md:block"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              {blueprint.sectionOrder.map((section, index) => {
                const Glyph = sectionGlyph(section.id);
                return (
                  <div
                    key={section.id}
                    className={cn('flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] font-medium', transitionClass)}
                    style={
                      index === 0
                        ? {
                            backgroundColor: 'hsl(var(--primary) / 0.1)',
                            color: 'hsl(var(--primary))',
                          }
                        : { color: 'hsl(var(--muted-foreground))' }
                    }
                  >
                    <Glyph className="h-3.5 w-3.5" />
                    <span className="truncate">{section.title}</span>
                  </div>
                );
              })}
            </aside>

            <main className="flex-1 space-y-3 p-3 md:p-4">
              <section
                className={cn('rounded-xl border bg-card', densityClass(density), transitionClass)}
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <p className="text-xs font-semibold">{blueprint.purpose}</p>
                <p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {truncate(blueprint.layoutSummary, 160)}
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {blueprint.sectionOrder.slice(0, 2).map((section) => (
                    <div
                      key={`kpi-${section.id}`}
                      className={cn('rounded-lg border bg-background p-3', transitionClass)}
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <p className="text-[10px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {section.title}
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {surface === 'customerApp' ? `${84 + section.priority}%` : `${32 + section.priority} min`}
                      </p>
                      <p className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {surface === 'customerApp' ? 'Completion score' : 'Ops cycle time'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-2 md:grid-cols-2">
                {blueprint.sectionOrder.map((section) => {
                  const Glyph = sectionGlyph(section.id);
                  return (
                    <article
                      key={`surface-${section.id}`}
                      className={cn('surface-block rounded-xl border bg-card', blockClass, transitionClass)}
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-md"
                          style={{
                            backgroundColor: 'hsl(var(--primary) / 0.12)',
                            color: 'hsl(var(--primary))',
                          }}
                        >
                          <Glyph className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-xs font-semibold">{section.title}</p>
                      </div>
                      <p className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        {truncate(section.description, 90)}
                      </p>
                      <div className="mt-3 space-y-1.5">
                        {section.interactionNotes.slice(0, 2).map((note) => (
                          <div key={note} className="flex items-start gap-1.5 text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <CheckCircle2 className="mt-[1px] h-3 w-3 shrink-0" style={{ color: 'hsl(var(--color-success))' }} />
                            <span>{truncate(note, 72)}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </section>

              <section
                className={cn('rounded-xl border bg-card p-3', transitionClass)}
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                <p className="text-[11px] font-semibold">Motion + Layout Guidance</p>
                <p className="mt-1 text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  Intensity: {data.motionSystem?.intensity ?? 'moderate'} | Density: {data.layoutSystem?.density ?? 'comfortable'} | Grid: {data.layoutSystem?.grid.columns ?? 12} columns
                </p>
              </section>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
