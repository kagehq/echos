import { supabase } from './supabase.js'

// Event type definition (same as in index.ts)
type EventMsg = { 
  id:string; 
  ts:number; 
  agent:string; 
  intent:string; 
  target?:string; 
  meta?:any; 
  preview?:string; 
  tokenAttached?:boolean; 
  request?:any; 
  response?:any; 
  metadata?:any; 
  policy?: any; 
  costUsd?: number;
  customerId?: string;
  subscriptionId?: string;
  feature?: string;
  environment?: string;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  correlationId?: string;
  duration?: number;
  tokensUsed?: number;
  modelVersion?: string;
  latency?: number;
  errorCode?: string;
  errorStack?: string;
  retryCount?: number;
  errorContext?: any;
  agentSpendLimits?: any;
}

/**
 * Store an event in the database
 */
export async function storeEvent(event: EventMsg, organizationId: string) {
  const { error } = await supabase
    .from('events')
    .insert({
      id: event.id,
      organization_id: organizationId,
      agent_id: event.agent,
      intent: event.intent,
      target: event.target || null,
      status: event.policy?.status || 'allow',
      metadata: {
        preview: event.preview,
        tokenAttached: event.tokenAttached,
        request: event.request,
        response: event.response,
        metadata: event.metadata,
        policy: event.policy,
        costUsd: event.costUsd,
        customerId: event.customerId,
        subscriptionId: event.subscriptionId,
        feature: event.feature,
        environment: event.environment,
        userAgent: event.userAgent,
        ipAddress: event.ipAddress,
        sessionId: event.sessionId,
        correlationId: event.correlationId,
        duration: event.duration,
        tokensUsed: event.tokensUsed,
        modelVersion: event.modelVersion,
        latency: event.latency,
        errorCode: event.errorCode,
        errorStack: event.errorStack,
        retryCount: event.retryCount,
        errorContext: event.errorContext,
        agentSpendLimits: event.agentSpendLimits
      },
      created_at: new Date(event.ts).toISOString()
    })

  if (error) {
    console.error('[DB] Error storing event:', error)
  }
}

/**
 * Get recent events for an organization
 */
export async function getEvents(organizationId: string, limit = 100) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[DB] Error fetching events:', error)
    return []
  }

  return data.map(event => ({
    id: event.id,
    ts: new Date(event.created_at).getTime(),
    agent: event.agent_id,
    intent: event.intent,
    target: event.target,
    ...event.metadata
  }))
}

/**
 * Get or create an agent in the database
 */
export async function getOrCreateAgent(name: string, organizationId: string, policy?: any) {
  // Check if agent exists
  const { data: existing } = await supabase
    .from('agents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('name', name)
    .single()

  if (existing) {
    return existing
  }

  // Create new agent
  const { data, error } = await supabase
    .from('agents')
    .insert({
      organization_id: organizationId,
      name,
      policy: policy || { allow: [], ask: [], block: [] },
      limits: {},
      active: true
    })
    .select()
    .single()

  if (error) {
    console.error('[DB] Error creating agent:', error)
    return null
  }

  return data
}

/**
 * Update agent policy
 */
export async function updateAgentPolicy(name: string, organizationId: string, policy: any, limits?: any) {
  const { error } = await supabase
    .from('agents')
    .update({
      policy,
      limits: limits || {},
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('name', name)

  if (error) {
    console.error('[DB] Error updating agent policy:', error)
    return false
  }

  return true
}

/**
 * Get agent by name and organization
 */
export async function getAgent(name: string, organizationId: string) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('name', name)
    .single()

  if (error) {
    return null
  }

  return data
}

/**
 * List all agents for an organization
 */
export async function listAgents(organizationId: string) {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('active', true)

  if (error) {
    console.error('[DB] Error listing agents:', error)
    return []
  }

  return data
}

// =============================================================================
// TEMPLATES
// =============================================================================

/**
 * Get a template by name (checks org templates first, then public templates)
 */
export async function getTemplate(name: string, organizationId: string) {
  // First, check for org-specific template
  let { data, error } = await supabase
    .from('templates')
    .select('*')
    .eq('name', name)
    .eq('organization_id', organizationId)
    .single()

  if (!error && data) {
    return data
  }

  // If not found, check for public template
  const { data: publicTemplate, error: publicError } = await supabase
    .from('templates')
    .select('*')
    .eq('name', name)
    .eq('is_public', true)
    .single()

  if (publicError) {
    return null
  }

  return publicTemplate
}

/**
 * List all templates available to an organization (org + public)
 */
export async function listTemplates(organizationId: string) {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .or(`organization_id.eq.${organizationId},is_public.eq.true`)
    .order('name')

  if (error) {
    console.error('[DB] Error listing templates:', error)
    return []
  }

  return data
}

/**
 * Create a new template
 */
export async function createTemplate(
  name: string,
  organizationId: string,
  policy: any,
  limits?: any,
  description?: string,
  createdBy?: string
) {
  const { data, error } = await supabase
    .from('templates')
    .insert({
      name,
      organization_id: organizationId,
      policy,
      limits: limits || null,
      description: description || null,
      is_public: false,
      created_by: createdBy || null
    })
    .select()
    .single()

  if (error) {
    console.error('[DB] Error creating template:', error)
    return null
  }

  return data
}

// =============================================================================
// TOKENS
// =============================================================================

/**
 * Store a token in the database
 */
export async function storeToken(
  token: string,
  organizationId: string,
  agentId: string,
  scopes: string[],
  expiresAt: Date,
  metadata?: {
    createdBy?: string
    createdReason?: string
    customerId?: string
    subscriptionId?: string
    preview?: string
  }
) {
  const { data, error } = await supabase
    .from('tokens')
    .insert({
      token,
      organization_id: organizationId,
      agent_id: agentId,
      scopes,
      status: 'active',
      expires_at: expiresAt.toISOString(),
      created_by: metadata?.createdBy || null,
      created_reason: metadata?.createdReason || null,
      customer_id: metadata?.customerId || null,
      subscription_id: metadata?.subscriptionId || null,
      preview: metadata?.preview || null
    })
    .select()
    .single()

  if (error) {
    console.error('[DB] Error storing token:', error)
    return null
  }

  return data
}

/**
 * Get a token by its value
 */
export async function getToken(token: string, organizationId: string) {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('token', token)
    .eq('organization_id', organizationId)
    .single()

  if (error) {
    return null
  }

  return data
}

/**
 * Update token status
 */
export async function updateTokenStatus(token: string, organizationId: string, status: 'active' | 'used' | 'revoked') {
  const { error } = await supabase
    .from('tokens')
    .update({ 
      status,
      used_at: status === 'used' ? new Date().toISOString() : undefined
    })
    .eq('token', token)
    .eq('organization_id', organizationId)

  if (error) {
    console.error('[DB] Error updating token status:', error)
    return false
  }

  return true
}

/**
 * List tokens for an agent
 */
export async function listTokens(organizationId: string, agentId?: string) {
  let query = supabase
    .from('tokens')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (agentId) {
    query = query.eq('agent_id', agentId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[DB] Error listing tokens:', error)
    return []
  }

  return data
}

// =============================================================================
// WEBHOOKS
// =============================================================================

/**
 * Get all webhooks for an organization
 */
export async function getWebhooks(organizationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('webhooks')
    .select('url')
    .eq('organization_id', organizationId)
    .eq('active', true)

  if (error) {
    console.error('[DB] Error fetching webhooks:', error)
    return []
  }

  return data.map(w => w.url)
}

/**
 * Add a webhook
 */
export async function addWebhook(url: string, organizationId: string) {
  const { data, error } = await supabase
    .from('webhooks')
    .insert({
      organization_id: organizationId,
      url,
      active: true
    })
    .select()
    .single()

  if (error) {
    console.error('[DB] Error adding webhook:', error)
    return null
  }

  return data
}

/**
 * Remove a webhook
 */
export async function removeWebhook(url: string, organizationId: string) {
  const { error } = await supabase
    .from('webhooks')
    .delete()
    .eq('organization_id', organizationId)
    .eq('url', url)

  if (error) {
    console.error('[DB] Error removing webhook:', error)
    return false
  }

  return true
}

// =============================================================================
// SPEND TRACKING
// =============================================================================

/**
 * Add spend for an agent
 */
export async function addSpend(
  organizationId: string,
  agentId: string,
  amountUsd: number,
  spendType: 'llm' | 'general',
  date: Date = new Date()
) {
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD

  const { error } = await supabase.rpc('upsert_agent_spend', {
    p_organization_id: organizationId,
    p_agent_id: agentId,
    p_spend_type: spendType,
    p_amount_usd: amountUsd,
    p_date: dateStr
  })

  if (error) {
    console.error('[DB] Error adding spend:', error)
    return false
  }

  return true
}

/**
 * Get spend summary for an agent
 */
export async function getSpendSummary(organizationId: string, agentId: string) {
  const { data, error } = await supabase.rpc('get_agent_spend_summary', {
    p_organization_id: organizationId,
    p_agent_id: agentId
  })

  if (error) {
    console.error('[DB] Error fetching spend summary:', error)
    return {
      llm_daily: 0,
      llm_monthly: 0,
      ai_daily: 0,
      ai_monthly: 0
    }
  }

  return data[0] || {
    llm_daily: 0,
    llm_monthly: 0,
    ai_daily: 0,
    ai_monthly: 0
  }
}

/**
 * Get all spend for metrics/analytics
 */
export async function getAllSpend(organizationId: string, limit = 1000) {
  const { data, error } = await supabase
    .from('agent_spend')
    .select('*')
    .eq('organization_id', organizationId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[DB] Error fetching all spend:', error)
    return []
  }

  return data
}

