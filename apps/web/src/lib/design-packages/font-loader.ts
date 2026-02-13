import { useEffect, useRef } from 'react';

const loadedUrls = new Set<string>();

/**
 * Dynamically load a Google Fonts stylesheet.
 * Deduplicates requests and uses font-display: swap.
 */
export function useGoogleFonts(url?: string) {
  const prevUrl = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!url || url === prevUrl.current) return;
    prevUrl.current = url;

    if (loadedUrls.has(url)) return;
    loadedUrls.add(url);

    // Add font-display=swap if not already present
    const finalUrl = url.includes('display=')
      ? url
      : `${url}${url.includes('?') ? '&' : '?'}display=swap`;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = finalUrl;
    link.dataset.designPackageFonts = 'true';
    document.head.appendChild(link);
  }, [url]);
}
