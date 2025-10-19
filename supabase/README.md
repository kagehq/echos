# Supabase Setup

## 🚀 Quick Start

```bash
pnpm run setup
```

This interactive script will:
- Guide you through creating a Supabase project
- Create environment files
- Run database migrations

**Done!** Now run `pnpm run dev:stack` to start developing.

---

## Manual Setup (Optional)

<details>
<summary>Click to expand manual setup instructions</summary>

### 1. Create Supabase Project
- Visit [supabase.com](https://supabase.com)
- Create new project
- Copy URL and keys from Settings → API

### 2. Configure Environment
Copy `env.example` to `.env` in both:
- `apps/dashboard/.env`
- `apps/daemon/.env`

### 3. Run Migration
Go to SQL Editor in Supabase Dashboard and run:
- `supabase/migrations/20241019000000_consolidated_schema.sql`

### 4. Verify
Check Table Editor for these tables:
- organizations, profiles, api_keys, agents, events, templates, tokens, webhooks

</details>

---

## Database Schema

**10 tables** with Row Level Security (RLS) enabled:
- `organizations` - Multi-tenant isolation
- `profiles` - User accounts with org membership
- `api_keys` - Authentication keys
- `agents` - Agent definitions with policies
- `events` - Action history
- `templates` - Policy templates (5 included)
- Plus: invitations, tokens, agent_spend, webhooks

**Security:** RLS ensures users only access their organization's data.

---

## Next Steps

After setup:

```bash
# Start development
pnpm run dev:stack

# Visit dashboard
open http://localhost:3000

# Sign up and create your first API key
```

---

## Advanced

<details>
<summary>Local Supabase Development</summary>

Run Supabase locally with Docker:

```bash
supabase start  # Starts local instance
supabase db reset  # Reset and re-run migrations
```

Update `.env` to point to `http://localhost:54321`

</details>

<details>
<summary>Troubleshooting</summary>

**RLS Policies Not Working?**
- Use the **anon key** (not service key) in frontend
- Verify RLS enabled in Supabase Dashboard → Policies

**Can't Create Organization?**
- Check Supabase Dashboard → Logs for errors
- Verify `create_organization_with_owner` function exists

</details>

