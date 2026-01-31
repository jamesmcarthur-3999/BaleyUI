'use client';

/**
 * API Documentation Page
 *
 * Renders Swagger UI for the BaleyUI REST API.
 */

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  ),
});

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">BaleyUI API Documentation</h1>
              <p className="text-muted-foreground">
                REST API v1 for executing AI flows and blocks
              </p>
            </div>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>

      {/* Swagger UI */}
      <div className="swagger-wrapper">
        <SwaggerUI
          url="/api/v1/openapi.json"
          docExpansion="list"
          defaultModelsExpandDepth={1}
          displayRequestDuration
          filter
          showExtensions
          showCommonExtensions
          tryItOutEnabled
        />
      </div>

      {/* Custom styles for Swagger UI */}
      <style jsx global>{`
        .swagger-wrapper {
          padding: 0 16px 32px;
        }

        .swagger-ui {
          font-family: inherit;
        }

        .swagger-ui .topbar {
          display: none;
        }

        .swagger-ui .info {
          margin: 30px 0;
        }

        .swagger-ui .info .title {
          font-size: 2rem;
          font-weight: 700;
        }

        .swagger-ui .info .description {
          font-size: 14px;
          line-height: 1.6;
        }

        .swagger-ui .opblock-tag {
          font-size: 1.25rem;
          font-weight: 600;
          border-bottom: 1px solid hsl(var(--border));
        }

        .swagger-ui .opblock {
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
          margin-bottom: 8px;
          box-shadow: none;
        }

        .swagger-ui .opblock .opblock-summary {
          border-radius: 8px;
        }

        .swagger-ui .opblock.opblock-get {
          background: hsl(var(--primary) / 0.05);
          border-color: hsl(var(--primary) / 0.3);
        }

        .swagger-ui .opblock.opblock-get .opblock-summary-method {
          background: hsl(var(--primary));
        }

        .swagger-ui .opblock.opblock-post {
          background: hsl(142 76% 36% / 0.05);
          border-color: hsl(142 76% 36% / 0.3);
        }

        .swagger-ui .opblock.opblock-post .opblock-summary-method {
          background: hsl(142 76% 36%);
        }

        .swagger-ui .btn {
          border-radius: 6px;
          font-weight: 500;
        }

        .swagger-ui .btn.execute {
          background: hsl(var(--primary));
          border-color: hsl(var(--primary));
        }

        .swagger-ui .btn.cancel {
          background: hsl(var(--muted));
          border-color: hsl(var(--border));
        }

        .swagger-ui select {
          border-radius: 6px;
          border-color: hsl(var(--border));
        }

        .swagger-ui input[type="text"] {
          border-radius: 6px;
          border-color: hsl(var(--border));
        }

        .swagger-ui textarea {
          border-radius: 6px;
          border-color: hsl(var(--border));
        }

        .swagger-ui .model-box {
          border-radius: 8px;
          border-color: hsl(var(--border));
        }

        .swagger-ui section.models {
          border: 1px solid hsl(var(--border));
          border-radius: 8px;
        }

        .swagger-ui section.models h4 {
          font-size: 1rem;
          font-weight: 600;
        }

        /* Dark mode adjustments */
        .dark .swagger-ui .opblock .opblock-section-header {
          background: hsl(var(--muted));
        }

        .dark .swagger-ui table thead tr td,
        .dark .swagger-ui table thead tr th {
          border-bottom-color: hsl(var(--border));
        }

        .dark .swagger-ui .response-col_status {
          color: inherit;
        }

        .dark .swagger-ui .markdown code,
        .dark .swagger-ui .renderedMarkdown code {
          background: hsl(var(--muted));
          color: inherit;
        }
      `}</style>
    </div>
  );
}
