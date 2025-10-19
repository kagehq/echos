-- ============================================================================
-- ECHOS CONSOLIDATED DATABASE SCHEMA
-- ============================================================================
-- This migration consolidates all tables, policies, and functions needed for
-- the Echos multi-tenant SaaS platform.
--
-- Tables:
-- - organizations: Top-level tenant entity
-- - profiles: User profiles with organization membership
-- - invitations: Pending user invitations
-- - api_keys: API keys for programmatic access
-- - agents: Agent definitions
-- - events: Event history
-- - templates: Policy templates (replaces YAML files)
-- - tokens: Scoped authorization tokens
-- - agent_spend: Daily spend tracking
-- - webhooks: Webhook URLs for event notifications
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  
  -- Billing
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  
  -- Limits
  max_agents INTEGER DEFAULT 5,
  max_events_per_month INTEGER DEFAULT 10000,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id);

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Organization membership
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  
  -- Permissions
  can_invite_users BOOLEAN DEFAULT false,
  can_manage_billing BOOLEAN DEFAULT false,
  can_manage_agents BOOLEAN DEFAULT true,
  can_view_analytics BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_profiles_organization ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================================================
-- INVITATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  
  -- Invitation state
  invited_by UUID REFERENCES profiles(id),
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- ============================================================================
-- API KEYS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Key details
  name TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  scopes TEXT[] DEFAULT ARRAY['*']::TEXT[],
  
  -- Status
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_organization ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key) WHERE active = true;

-- ============================================================================
-- AGENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Agent details
  name TEXT NOT NULL,
  policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_organization ON agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(organization_id, name);

-- ============================================================================
-- EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  
  -- Event details
  intent TEXT NOT NULL,
  target TEXT,
  status TEXT DEFAULT 'allow',
  
  -- Metadata (stored as JSONB for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_organization ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_intent ON events(intent);

-- ============================================================================
-- TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  policy JSONB NOT NULL DEFAULT '{"allow": [], "ask": [], "block": []}'::jsonb,
  limits JSONB,
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_templates_org ON templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_templates_public ON templates(is_public) WHERE is_public = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_public_name ON templates(name) WHERE is_public = true;

-- ============================================================================
-- TOKENS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  agent_id TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_reason TEXT,
  customer_id TEXT,
  subscription_id TEXT,
  preview TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_org ON tokens(organization_id);
CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token);
CREATE INDEX IF NOT EXISTS idx_tokens_agent ON tokens(agent_id);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);

-- ============================================================================
-- AGENT SPEND TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  spend_type TEXT NOT NULL CHECK (spend_type IN ('llm', 'general')),
  amount_usd DECIMAL(10, 4) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, agent_id, spend_type, date)
);

CREATE INDEX IF NOT EXISTS idx_agent_spend_org ON agent_spend(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_spend_agent ON agent_spend(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_spend_date ON agent_spend(date);
CREATE INDEX IF NOT EXISTS idx_agent_spend_type ON agent_spend(spend_type);

-- ============================================================================
-- WEBHOOKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  events TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, url)
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org ON webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active) WHERE active = true;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create organization and set user as owner
CREATE OR REPLACE FUNCTION create_organization_with_owner(
  org_name TEXT,
  org_slug TEXT,
  user_id UUID,
  user_email TEXT,
  user_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create organization
  INSERT INTO organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;
  
  -- Create profile as owner
  INSERT INTO profiles (
    id,
    email,
    full_name,
    organization_id,
    role,
    can_invite_users,
    can_manage_billing,
    can_manage_agents,
    can_view_analytics
  )
  VALUES (
    user_id,
    user_email,
    user_name,
    new_org_id,
    'owner',
    true,
    true,
    true,
    true
  );
  
  RETURN new_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate unique slug from name
CREATE OR REPLACE FUNCTION generate_unique_slug(base_slug TEXT)
RETURNS TEXT AS $$
DECLARE
  slug TEXT;
  counter INTEGER := 0;
BEGIN
  slug := base_slug;
  
  WHILE EXISTS (SELECT 1 FROM organizations WHERE organizations.slug = slug) LOOP
    counter := counter + 1;
    slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN slug;
END;
$$ LANGUAGE plpgsql;

-- Function to upsert agent spend
CREATE OR REPLACE FUNCTION upsert_agent_spend(
  p_organization_id UUID,
  p_agent_id TEXT,
  p_spend_type TEXT,
  p_amount_usd DECIMAL,
  p_date DATE
) RETURNS void AS $$
BEGIN
  INSERT INTO agent_spend (organization_id, agent_id, spend_type, amount_usd, date)
  VALUES (p_organization_id, p_agent_id, p_spend_type, p_amount_usd, p_date)
  ON CONFLICT (organization_id, agent_id, spend_type, date)
  DO UPDATE SET amount_usd = agent_spend.amount_usd + EXCLUDED.amount_usd;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get agent spend summary
CREATE OR REPLACE FUNCTION get_agent_spend_summary(
  p_organization_id UUID,
  p_agent_id TEXT
) RETURNS TABLE (
  llm_daily DECIMAL,
  llm_monthly DECIMAL,
  ai_daily DECIMAL,
  ai_monthly DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(CASE WHEN spend_type = 'llm' AND date = CURRENT_DATE THEN amount_usd ELSE 0 END), 0) as llm_daily,
    COALESCE(SUM(CASE WHEN spend_type = 'llm' AND date >= date_trunc('month', CURRENT_DATE) THEN amount_usd ELSE 0 END), 0) as llm_monthly,
    COALESCE(SUM(CASE WHEN date = CURRENT_DATE THEN amount_usd ELSE 0 END), 0) as ai_daily,
    COALESCE(SUM(CASE WHEN date >= date_trunc('month', CURRENT_DATE) THEN amount_usd ELSE 0 END), 0) as ai_monthly
  FROM agent_spend
  WHERE organization_id = p_organization_id AND agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_templates_updated_at ON templates;
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tokens_updated_at ON tokens;
CREATE TRIGGER update_tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- Organizations Policies
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners can update organization" ON organizations;
CREATE POLICY "Owners can update organization" ON organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid() 
        AND role = 'owner'
    )
  );

-- Profiles Policies
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- Invitations Policies
DROP POLICY IF EXISTS "Users can view org invitations" ON invitations;
CREATE POLICY "Users can view org invitations" ON invitations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage invitations" ON invitations;
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid() 
        AND role IN ('owner', 'admin')
        AND (can_invite_users = true OR role = 'owner')
    )
  );

-- API Keys Policies
DROP POLICY IF EXISTS "Users can view org api keys" ON api_keys;
CREATE POLICY "Users can view org api keys" ON api_keys
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create org api keys" ON api_keys;
CREATE POLICY "Users can create org api keys" ON api_keys
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update org api keys" ON api_keys;
CREATE POLICY "Users can update org api keys" ON api_keys
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete org api keys" ON api_keys;
CREATE POLICY "Users can delete org api keys" ON api_keys
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- Agents Policies
DROP POLICY IF EXISTS "Users can view org agents" ON agents;
CREATE POLICY "Users can view org agents" ON agents
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create org agents" ON agents;
CREATE POLICY "Users can create org agents" ON agents
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update org agents" ON agents;
CREATE POLICY "Users can update org agents" ON agents
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete org agents" ON agents;
CREATE POLICY "Users can delete org agents" ON agents
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- Events Policies
DROP POLICY IF EXISTS "Users can view org events" ON events;
CREATE POLICY "Users can view org events" ON events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create org events" ON events;
CREATE POLICY "Users can create org events" ON events
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- Templates Policies
DROP POLICY IF EXISTS "Users can view public templates and org templates" ON templates;
CREATE POLICY "Users can view public templates and org templates" ON templates
  FOR SELECT
  USING (
    is_public = true OR 
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create org templates" ON templates;
CREATE POLICY "Users can create org templates" ON templates
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update org templates" ON templates;
CREATE POLICY "Users can update org templates" ON templates
  FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete org templates" ON templates;
CREATE POLICY "Users can delete org templates" ON templates
  FOR DELETE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Tokens Policies
DROP POLICY IF EXISTS "Users can view org tokens" ON tokens;
CREATE POLICY "Users can view org tokens" ON tokens
  FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create org tokens" ON tokens;
CREATE POLICY "Users can create org tokens" ON tokens
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update org tokens" ON tokens;
CREATE POLICY "Users can update org tokens" ON tokens
  FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete org tokens" ON tokens;
CREATE POLICY "Users can delete org tokens" ON tokens
  FOR DELETE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Agent Spend Policies
DROP POLICY IF EXISTS "Users can view org spend" ON agent_spend;
CREATE POLICY "Users can view org spend" ON agent_spend
  FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create org spend records" ON agent_spend;
CREATE POLICY "Users can create org spend records" ON agent_spend
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Webhooks Policies
DROP POLICY IF EXISTS "Users can view org webhooks" ON webhooks;
CREATE POLICY "Users can view org webhooks" ON webhooks
  FOR SELECT
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can create org webhooks" ON webhooks;
CREATE POLICY "Users can create org webhooks" ON webhooks
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update org webhooks" ON webhooks;
CREATE POLICY "Users can update org webhooks" ON webhooks
  FOR UPDATE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete org webhooks" ON webhooks;
CREATE POLICY "Users can delete org webhooks" ON webhooks
  FOR DELETE
  USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- SEED DATA - PUBLIC TEMPLATES
-- ============================================================================

INSERT INTO templates (name, description, policy, limits, is_public, created_by)
VALUES 
  (
    'unrestricted',
    'No restrictions - all actions allowed',
    '{"allow": [".*"], "ask": [], "block": []}'::jsonb,
    NULL,
    true,
    NULL
  ),
  (
    'customer_support',
    'Customer support agent with email and Slack permissions',
    '{"allow": ["email\\.send:.*support.*", "slack\\.post:.*support.*", "kb\\.search:.*"], "ask": ["email\\.send:.*", "slack\\.post:.*"], "block": ["db\\..*", "admin\\..*"]}'::jsonb,
    NULL,
    true,
    NULL
  ),
  (
    'research_assistant',
    'Research assistant with web search and knowledge base access',
    '{"allow": ["web\\.search:.*", "kb\\.search:.*", "llm\\.chat:.*"], "ask": ["email\\.send:.*"], "block": ["db\\..*", "admin\\..*", "slack\\..*"]}'::jsonb,
    NULL,
    true,
    NULL
  ),
  (
    'internal_notifier',
    'Internal notifications only',
    '{"allow": ["slack\\.post:.*internal.*", "email\\.send:.*@company\\.com"], "ask": [], "block": [".*:.*external.*", "db\\..*", "admin\\..*"]}'::jsonb,
    NULL,
    true,
    NULL
  ),
  (
    'capped_user',
    'User with spend limits',
    '{"allow": ["llm\\.chat:.*", "email\\.send:.*", "slack\\.post:.*"], "ask": ["db\\.write:.*"], "block": ["admin\\..*", "system\\..*"]}'::jsonb,
    '{"ai_daily_usd": 1.0, "ai_monthly_usd": 10.0, "llm_daily_usd": 0.5, "llm_monthly_usd": 5.0}'::jsonb,
    true,
    NULL
  )
ON CONFLICT (name) WHERE is_public = true DO NOTHING;

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================
COMMENT ON TABLE organizations IS 'Organizations are the top-level tenant in the multi-tenant architecture';
COMMENT ON TABLE profiles IS 'User profiles extending Supabase auth.users with organization membership';
COMMENT ON TABLE invitations IS 'Pending user invitations to join organizations';
COMMENT ON TABLE api_keys IS 'API keys for programmatic access to the daemon';
COMMENT ON TABLE agents IS 'Agent definitions with policies and limits';
COMMENT ON TABLE events IS 'Event history for all agent actions';
COMMENT ON TABLE templates IS 'Policy templates for agents (replaces YAML files)';
COMMENT ON TABLE tokens IS 'Scoped authorization tokens';
COMMENT ON TABLE agent_spend IS 'Daily spend tracking per agent';
COMMENT ON TABLE webhooks IS 'Webhook URLs for event notifications (org-scoped)';

