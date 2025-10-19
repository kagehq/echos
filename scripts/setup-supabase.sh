#!/usr/bin/env bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║           🚀 Echos Setup Assistant                       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "This script will help you set up Echos with Supabase."
echo ""

# Function to prompt for input with validation
prompt_input() {
  local prompt=$1
  local var_name=$2
  local validate=$3
  local value=""
  
  while true; do
    echo -e "${BLUE}${prompt}${NC}"
    read -r value
    
    if [ -z "$value" ]; then
      echo -e "${RED}❌ This field is required${NC}"
      continue
    fi
    
    if [ "$validate" == "url" ]; then
      if [[ ! "$value" =~ ^https?:// ]]; then
        echo -e "${RED}❌ Please enter a valid URL (starting with http:// or https://)${NC}"
        continue
      fi
    fi
    
    eval "$var_name='$value'"
    break
  done
}

# Step 1: Check if Supabase project exists
echo -e "${BOLD}Step 1: Supabase Project${NC}"
echo "────────────────────────────────────────────────────────"
echo ""
echo "Do you have a Supabase project set up?"
echo "  1) Yes, I have a Supabase project"
echo "  2) No, help me set one up"
echo ""
read -p "Choose (1-2): " choice

if [ "$choice" == "2" ]; then
  echo ""
  echo -e "${YELLOW}📝 Setting up a new Supabase project:${NC}"
  echo ""
  echo "1. Visit https://supabase.com and sign up/login"
  echo "2. Click 'New Project'"
  echo "3. Fill in:"
  echo "   - Name: echos-saas (or your preferred name)"
  echo "   - Database Password: Generate a strong password"
  echo "   - Region: Choose closest to you"
  echo "4. Wait for the project to initialize (~2 minutes)"
  echo ""
  echo "Press Enter when your project is ready..."
  read -r
fi

# Step 2: Collect Supabase credentials
echo ""
echo -e "${BOLD}Step 2: Supabase Credentials${NC}"
echo "────────────────────────────────────────────────────────"
echo ""
echo "Go to your Supabase project → Settings → API"
echo ""

prompt_input "🔗 Project URL (e.g., https://xxxxx.supabase.co):" SUPABASE_URL "url"
prompt_input "🔑 Anon/Public Key (starts with eyJhbGciOi...):" SUPABASE_ANON_KEY
prompt_input "🔐 Service Role Key (starts with eyJhbGciOi...):" SUPABASE_SERVICE_KEY

# Optional: JWT Secret
echo ""
echo -e "${YELLOW}💡 JWT Secret (optional, press Enter to skip):${NC}"
read -r JWT_SECRET

# Step 3: Create env files
echo ""
echo -e "${BOLD}Step 3: Creating Environment Files${NC}"
echo "────────────────────────────────────────────────────────"
echo ""

# Dashboard .env
DASHBOARD_ENV="apps/dashboard/.env"
echo "Creating $DASHBOARD_ENV..."
cat > "$DASHBOARD_ENV" <<EOF
# Supabase Configuration
NUXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NUXT_PUBLIC_SUPABASE_KEY=$SUPABASE_ANON_KEY

# Daemon URL (local development)
DAEMON_URL=http://127.0.0.1:3434
EOF

echo -e "${GREEN}✓ Created $DASHBOARD_ENV${NC}"

# Daemon .env
DAEMON_ENV="apps/daemon/.env"
echo "Creating $DAEMON_ENV..."
cat > "$DAEMON_ENV" <<EOF
# Supabase Configuration (for Phase 2: Database-Driven Mode)
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

# JWT Configuration (for token signing)
JWT_SECRET=${JWT_SECRET:-your-jwt-secret-here}
EOF

echo -e "${GREEN}✓ Created $DAEMON_ENV${NC}"

# Step 4: Database migrations
echo ""
echo -e "${BOLD}Step 4: Database Setup${NC}"
echo "────────────────────────────────────────────────────────"
echo ""
echo "Choose how to set up your database:"
echo "  1) Via Supabase Dashboard (easier, copy-paste SQL)"
echo "  2) Via Supabase CLI (recommended for development)"
echo ""
read -p "Choose (1-2): " db_choice

if [ "$db_choice" == "1" ]; then
  echo ""
  echo -e "${YELLOW}📝 Manual setup steps:${NC}"
  echo ""
  echo "1. Go to your Supabase project → SQL Editor"
  echo "2. Click 'New Query'"
  echo "3. Copy and paste the contents of:"
  echo "   ${BOLD}supabase/migrations/20241019000000_consolidated_schema.sql${NC}"
  echo ""
  echo "   (This single migration creates all tables, policies, and seed data)"
  echo ""
  echo "4. Click 'Run' to execute the migration"
  echo ""
  echo "Press Enter when migration is complete..."
  read -r
  
elif [ "$db_choice" == "2" ]; then
  echo ""
  # Check if Supabase CLI is installed
  if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}Supabase CLI not found. Installing...${NC}"
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
      brew install supabase/tap/supabase
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
      # Linux installation
      curl -sSfL https://raw.githubusercontent.com/supabase/cli/main/install.sh | sh
    else
      echo -e "${RED}❌ Unable to auto-install Supabase CLI${NC}"
      echo "Please install manually: https://supabase.com/docs/guides/cli"
      exit 1
    fi
  fi
  
  echo "Logging in to Supabase..."
  supabase login
  
  echo ""
  echo "Enter your project reference (found in Settings → General):"
  read -r PROJECT_REF
  
  echo "Linking to project..."
  supabase link --project-ref "$PROJECT_REF"
  
  echo "Running migrations..."
  supabase db push
  
  echo -e "${GREEN}✓ Database migrations complete${NC}"
fi

# Step 5: Verify setup
echo ""
echo -e "${BOLD}Step 5: Verifying Setup${NC}"
echo "────────────────────────────────────────────────────────"
echo ""

echo "Please verify the following tables exist in your Supabase project:"
echo "  ✓ organizations"
echo "  ✓ profiles"
echo "  ✓ invitations"
echo "  ✓ api_keys"
echo "  ✓ agents"
echo "  ✓ events"
echo "  ✓ templates (with 5 public templates)"
echo "  ✓ tokens"
echo "  ✓ agent_spend"
echo "  ✓ webhooks"
echo ""
echo "You can check this in: Supabase Dashboard → Table Editor"
echo ""
read -p "Are all tables present? (y/n): " tables_ok

if [ "$tables_ok" != "y" ]; then
  echo -e "${RED}❌ Setup incomplete. Please run migrations manually.${NC}"
  exit 1
fi

# Success!
echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              ✨ Setup Complete! ✨                        ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Environment files created${NC}"
echo -e "${GREEN}✓ Database configured${NC}"
echo ""
echo -e "${BOLD}Next Steps:${NC}"
echo ""
echo "1. Start the development stack:"
echo -e "   ${BLUE}pnpm run dev:stack${NC}"
echo ""
echo "2. Sign up for an account:"
echo -e "   ${BLUE}http://localhost:3000/signup${NC}"
echo ""
echo "3. Create an API key:"
echo -e "   ${BLUE}http://localhost:3000/settings${NC} → Create New Key"
echo ""
echo "4. Run an example agent:"
echo -e "   ${BLUE}export ECHOS_API_KEY=your-api-key-here${NC}"
echo -e "   ${BLUE}tsx examples/basic-usage.ts${NC}"
echo ""
echo -e "${YELLOW}💡 Tip: Check out the examples/ directory for more agent usage examples${NC}"
echo ""


