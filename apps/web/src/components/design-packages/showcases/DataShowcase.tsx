'use client';

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const data = [
  { name: 'Email Classifier', status: 'active', executions: 1284, successRate: '98.2%' },
  { name: 'Data Enricher', status: 'active', executions: 847, successRate: '95.1%' },
  { name: 'Report Generator', status: 'paused', executions: 312, successRate: '99.7%' },
  { name: 'Alert Monitor', status: 'error', executions: 56, successRate: '78.4%' },
];

const statusCSSVars: Record<string, string> = {
  active: '--color-success',
  paused: '--color-warning',
  error: '--color-error',
};

export function DataShowcase() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Table</h3>
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Executions</TableHead>
                <TableHead className="text-right">Success</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => {
                const cssVar = statusCSSVars[row.status] ?? '--color-info';
                return (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="capitalize"
                        style={{
                          backgroundColor: `hsl(var(${cssVar}) / 0.1)`,
                          color: `hsl(var(${cssVar}))`,
                          borderColor: `hsl(var(${cssVar}) / 0.25)`,
                        }}
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.executions.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.successRate}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Badges</h3>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Separators</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground">Item One</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-muted-foreground">Item Two</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-muted-foreground">Item Three</span>
          </div>
          <Separator />
          <p className="text-sm text-muted-foreground">Content below a horizontal separator.</p>
        </div>
      </div>
    </div>
  );
}
