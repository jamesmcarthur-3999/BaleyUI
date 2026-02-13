import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

/**
 * Force dynamic rendering for all routes.
 * This prevents static generation errors when env vars are missing at build time.
 */
export const dynamic = 'force-dynamic';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BaleyUI - AI-First Product Development',
  description: 'Visual platform for building, composing, and evolving AI-powered workflows',
  metadataBase: new URL('https://baley-ui-web.vercel.app'),
  openGraph: {
    title: 'BaleyUI',
    description: 'Visual platform for building, composing, and evolving AI-powered workflows',
    siteName: 'BaleyUI',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'BaleyUI',
    description: 'Visual platform for building, composing, and evolving AI-powered workflows',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
