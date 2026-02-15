#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOGS_DIR="$ROOT_DIR/.logs"
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
RUN_DIR="$LOGS_DIR/$TIMESTAMP"

mkdir -p "$RUN_DIR"

# Symlink .logs/latest to current run
ln -sfn "$RUN_DIR" "$LOGS_DIR/latest"

echo "Logging to $RUN_DIR"

# Clean up old runs — keep only the last 10
cd "$LOGS_DIR"
# List directories (not symlinks), sort oldest first, delete excess
ls -dt */ 2>/dev/null | tail -n +11 | while read -r dir; do
  rm -rf "$LOGS_DIR/$dir"
done
cd "$ROOT_DIR"

# Run next dev, tee everything to full.log, and split server/client
pnpm --filter @baleyui/web dev 2>&1 | tee "$RUN_DIR/full.log" | while IFS= read -r line; do
  # Echo to terminal
  echo "$line"

  # Server markers: lines with ○, GET/POST/PUT/DELETE, [API], compiled, or route handlers
  if echo "$line" | grep -qE '^ ○ |^\s*(GET|POST|PUT|DELETE|PATCH)\s|(\[API\])|compiled server|Route .* \d+ms| ✓ Compiled'; then
    echo "$line" >> "$RUN_DIR/server.log"
  else
    echo "$line" >> "$RUN_DIR/client.log"
  fi
done
