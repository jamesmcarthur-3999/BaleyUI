'use client';

import { Download, Boxes, Wrench, Cpu } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';

interface ExportCardProps {
  baleybotId: string;
  name: string;
  entityCount: number;
  toolCount: number;
  providerCount: number;
}

export function ExportCard({
  baleybotId,
  name,
  entityCount,
  toolCount,
  providerCount,
}: ExportCardProps) {
  const [downloading, setDownloading] = useState(false);
  const exportQuery = trpc.baleybots.exportBaleybot.useQuery(
    { id: baleybotId },
    { enabled: false }
  );

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const result = await exportQuery.refetch();
      if (result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.baleybot.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setDownloading(false);
    }
  };

  const estimatedSize = Math.max(1, Math.round((entityCount * 0.8 + toolCount * 0.3) * 10) / 10);

  return (
    <Card className="overflow-hidden animate-card-appear">
      {/* Top gradient stripe */}
      <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />

      <CardContent className="p-4 space-y-4">
        {/* Bot info */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">
            🤖
          </div>
          <div>
            <p className="text-sm font-semibold">{name}</p>
            <p className="text-xs text-muted-foreground">Runtime export bundle</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/30 p-2.5">
            <Boxes className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold tabular-nums">{entityCount}</span>
            <span className="text-[10px] text-muted-foreground">Entities</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/30 p-2.5">
            <Wrench className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold tabular-nums">{toolCount}</span>
            <span className="text-[10px] text-muted-foreground">Tools</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/30 p-2.5">
            <Cpu className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold tabular-nums">{providerCount}</span>
            <span className="text-[10px] text-muted-foreground">Providers</span>
          </div>
        </div>

        {/* Estimated size */}
        <p className="text-xs text-muted-foreground text-center">
          Estimated size: ~{estimatedSize} KB
        </p>

        {/* Download button */}
        <Button
          variant="premium"
          className="w-full"
          onClick={handleDownload}
          disabled={downloading}
        >
          <Download className="h-4 w-4 mr-2" />
          {downloading ? 'Downloading...' : 'Download Bundle'}
        </Button>
      </CardContent>
    </Card>
  );
}
