#!/usr/bin/env bash
set -euo pipefail

# BaleyUI — One-command setup
# Usage: pnpm setup

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${BOLD}$1${NC}"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✗${NC} $1"; exit 1; }

ENV_FILE="apps/web/.env.local"
ENV_EXAMPLE="apps/web/.env.example"
DOCKER_CONTAINER="baleyui-postgres"
DOCKER_PORT=5432
DB_NAME="baleyui"
DB_USER="baleyui"
DB_PASS="baleyui"

echo ""
info "=== BaleyUI Setup ==="
echo ""

# ─── Prerequisites ──────────────────────────────────────────────────────────

info "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js is not installed. Install Node.js 20+ from https://nodejs.org"
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  fail "Node.js 20+ required (found v$(node -v)). Update from https://nodejs.org"
fi
ok "Node.js $(node -v)"

# pnpm
if ! command -v pnpm &>/dev/null; then
  fail "pnpm is not installed. Install with: npm install -g pnpm"
fi
ok "pnpm $(pnpm --version)"

echo ""

# ─── Environment File ──────────────────────────────────────────────────────

info "Setting up environment..."

if [ -f "$ENV_FILE" ]; then
  ok "$ENV_FILE already exists (skipping)"
else
  if [ ! -f "$ENV_EXAMPLE" ]; then
    fail "Missing $ENV_EXAMPLE — is this the project root?"
  fi
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  # Generate BETTER_AUTH_SECRET
  AUTH_SECRET=$(openssl rand -base64 32)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$AUTH_SECRET|" "$ENV_FILE"
  else
    sed -i "s|BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$AUTH_SECRET|" "$ENV_FILE"
  fi

  # Generate ENCRYPTION_KEY
  ENC_KEY=$(openssl rand -hex 32)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENC_KEY|" "$ENV_FILE"
  else
    sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENC_KEY|" "$ENV_FILE"
  fi

  ok "Created $ENV_FILE with generated secrets"
fi

# ─── Database ───────────────────────────────────────────────────────────────

info "Checking database..."

# Read current DATABASE_URL from env file
CURRENT_DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- || true)

# Check if it's still the template default
if [ "$CURRENT_DB_URL" = "postgresql://username:password@localhost:5432/baleyui" ] || [ -z "$CURRENT_DB_URL" ]; then
  # Check if our Docker container is already running
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${DOCKER_CONTAINER}$"; then
    ok "Docker container '$DOCKER_CONTAINER' already running"
    DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DOCKER_PORT}/${DB_NAME}"
  elif command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    info "Starting PostgreSQL in Docker..."
    # Remove stopped container if it exists
    docker rm -f "$DOCKER_CONTAINER" &>/dev/null || true
    docker run -d \
      --name "$DOCKER_CONTAINER" \
      -e POSTGRES_USER="$DB_USER" \
      -e POSTGRES_PASSWORD="$DB_PASS" \
      -e POSTGRES_DB="$DB_NAME" \
      -p "${DOCKER_PORT}:5432" \
      postgres:16-alpine >/dev/null

    DB_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DOCKER_PORT}/${DB_NAME}"

    # Wait for Postgres to be ready
    echo -n "  Waiting for PostgreSQL..."
    for i in $(seq 1 30); do
      if docker exec "$DOCKER_CONTAINER" pg_isready -U "$DB_USER" &>/dev/null; then
        echo ""
        ok "PostgreSQL is ready on port $DOCKER_PORT"
        break
      fi
      echo -n "."
      sleep 1
      if [ "$i" -eq 30 ]; then
        echo ""
        fail "PostgreSQL failed to start within 30s"
      fi
    done
  else
    warn "DATABASE_URL is still the template default and Docker is not available."
    echo ""
    echo "  Options:"
    echo "    1. Install Docker Desktop and re-run: pnpm setup"
    echo "    2. Provision a cloud database (Neon, Supabase) and update DATABASE_URL in $ENV_FILE"
    echo "    3. Install PostgreSQL locally and update DATABASE_URL in $ENV_FILE"
    echo ""
    fail "Cannot proceed without a database. Update DATABASE_URL in $ENV_FILE and re-run."
  fi

  # Update .env.local with the Docker URL
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|DATABASE_URL=.*|DATABASE_URL=$DB_URL|" "$ENV_FILE"
  else
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=$DB_URL|" "$ENV_FILE"
  fi
  ok "Set DATABASE_URL to $DB_URL"
else
  ok "DATABASE_URL is configured (not template default)"
fi

echo ""

# ─── Install Dependencies ──────────────────────────────────────────────────

info "Installing dependencies..."
pnpm install
ok "Dependencies installed"

echo ""

# ─── Push Schema ────────────────────────────────────────────────────────────

info "Pushing database schema..."
# Source the env file for the db:push command
set -a
source "$ENV_FILE" 2>/dev/null || true
set +a
pnpm db:push
ok "Database schema is up to date"

echo ""

# ─── Done ───────────────────────────────────────────────────────────────────

info "=== Setup Complete ==="
echo ""
echo "  Next steps:"
echo ""
echo "    1. Start the dev server:"
echo "       ${BOLD}pnpm dev${NC}"
echo ""
echo "    2. Open http://localhost:3000/sign-in"
echo "       Click ${BOLD}\"Dev Bypass (skip login)\"${NC} to sign in"
echo ""
echo "    3. (Optional) Seed demo data:"
echo "       ${BOLD}pnpm db:seed${NC}"
echo ""
