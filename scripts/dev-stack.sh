#!/usr/bin/env bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Starting Echos development stack..."
echo ""

# Check if .env files exist
check_env_file() {
  local env_file=$1
  local app_name=$2
  
  if [ ! -f "$env_file" ]; then
    echo -e "${YELLOW}⚠️  Warning: $env_file not found${NC}"
    echo -e "   Run: ${GREEN}cp $env_file.example $env_file${NC}"
    echo -e "   Then configure your Supabase credentials"
    echo ""
    return 1
  fi
  return 0
}

# Check for required env files
missing_env=0
check_env_file "apps/dashboard/.env" "Dashboard" || missing_env=1
check_env_file "apps/daemon/.env" "Daemon" || missing_env=1

if [ $missing_env -eq 1 ]; then
  echo -e "${RED}❌ Missing environment files. Please configure them before starting.${NC}"
  echo -e "${GREEN}💡 Tip: Run 'pnpm run setup' for automated setup${NC}"
  echo ""
  exit 1
fi

# Load environment variables for the current shell session
if [ -f "apps/dashboard/.env" ]; then
  set -a
  source apps/dashboard/.env
  set +a
fi

if [ -f "apps/daemon/.env" ]; then
  set -a
  source apps/daemon/.env
  set +a
fi

echo -e "${GREEN}✓ Environment variables loaded${NC}"
echo ""
echo "📦 Starting services..."
echo "   Dashboard: http://localhost:3000"
echo "   Daemon API: http://localhost:3434"
echo ""

# Start both daemon and dashboard in parallel
pnpm -r --parallel --filter @echos/daemon --filter @echos/dashboard run dev
