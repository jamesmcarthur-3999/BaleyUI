'use client';


interface PercentileData {
  name: string;
  p50: number;
  p95: number;
  p99: number;
}

interface LatencyPercentileChartProps {
  data: PercentileData[];
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function LatencyPercentileChart({ data }: LatencyPercentileChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  const maxLatency = Math.max(
    ...data.flatMap((item) => [item.p50, item.p95, item.p99])
  );

  return (
    <div className="space-y-6">
      {data.map((item, index) => {
        const p50Width = (item.p50 / maxLatency) * 100;
        const p95Width = (item.p95 / maxLatency) * 100;
        const p99Width = (item.p99 / maxLatency) * 100;

        return (
          <div key={index} className="space-y-2">
            <div className="font-medium text-sm">{item.name}</div>

            <div className="space-y-1">
              {/* P50 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">P50</span>
                <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-green-500 flex items-center justify-end px-2 transition-all duration-500"
                    style={{ width: `${p50Width}%` }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {formatLatency(item.p50)}
                    </span>
                  </div>
                </div>
              </div>

              {/* P95 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">P95</span>
                <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-yellow-500 flex items-center justify-end px-2 transition-all duration-500"
                    style={{ width: `${p95Width}%` }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {formatLatency(item.p95)}
                    </span>
                  </div>
                </div>
              </div>

              {/* P99 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-12">P99</span>
                <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-red-500 flex items-center justify-end px-2 transition-all duration-500"
                    style={{ width: `${p99Width}%` }}
                  >
                    <span className="text-xs font-semibold text-white">
                      {formatLatency(item.p99)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span>P50 (Median)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-yellow-500" />
          <span>P95</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span>P99</span>
        </div>
      </div>
    </div>
  );
}
