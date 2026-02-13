'use client';

import { useState, useId } from 'react';
import type { DesignPackageData } from '@/lib/design-packages/types';
import { packageToCSSString } from '@/lib/design-packages/css-variables';
import { useGoogleFonts } from '@/lib/design-packages/font-loader';
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewTabs, type ShowcaseCategory } from './PreviewTabs';
import { ButtonsShowcase } from './showcases/ButtonsShowcase';
import { FormsShowcase } from './showcases/FormsShowcase';
import { CardsShowcase } from './showcases/CardsShowcase';
import { NavigationShowcase } from './showcases/NavigationShowcase';
import { DataShowcase } from './showcases/DataShowcase';
import { FeedbackShowcase } from './showcases/FeedbackShowcase';
import { cn } from '@/lib/utils';

type Viewport = 'desktop' | 'tablet' | 'mobile';

const viewportWidths: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

interface DesignPreviewProps {
  data: DesignPackageData;
  className?: string;
}

const showcaseComponents: Record<ShowcaseCategory, React.FC> = {
  buttons: ButtonsShowcase,
  forms: FormsShowcase,
  cards: CardsShowcase,
  navigation: NavigationShowcase,
  data: DataShowcase,
  feedback: FeedbackShowcase,
};

export function DesignPreview({ data, className }: DesignPreviewProps) {
  const uniqueId = useId().replace(/:/g, '');
  const containerId = `preview-${uniqueId}`;
  const [isDark, setIsDark] = useState(false);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [activeCategory, setActiveCategory] = useState<ShowcaseCategory>('buttons');

  useGoogleFonts(data.typography.googleFontsUrl);

  const cssString = packageToCSSString(data, containerId, isDark ? 'dark' : 'light');
  const fontStyle = data.typography.fontFamily
    ? `#${containerId} { font-family: ${data.typography.fontFamily}; }`
    : '';

  const ActiveShowcase = showcaseComponents[activeCategory];

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <PreviewTabs active={activeCategory} onChange={setActiveCategory} />
        <PreviewToolbar
          isDark={isDark}
          onToggleDark={() => setIsDark((d) => !d)}
          viewport={viewport}
          onViewportChange={setViewport}
        />
      </div>

      <style dangerouslySetInnerHTML={{ __html: cssString + '\n' + fontStyle }} />

      <div
        className="mx-auto overflow-hidden rounded-xl border border-border transition-all duration-300"
        style={{ maxWidth: viewportWidths[viewport] }}
      >
        <div
          id={containerId}
          className={cn(
            'min-h-[400px] p-6 transition-colors duration-300',
            isDark ? 'dark' : ''
          )}
          style={{
            backgroundColor: `hsl(var(--background))`,
            color: `hsl(var(--foreground))`,
          }}
        >
          <div key={activeCategory} className="animate-in fade-in duration-200">
            <ActiveShowcase />
          </div>
        </div>
      </div>
    </div>
  );
}
