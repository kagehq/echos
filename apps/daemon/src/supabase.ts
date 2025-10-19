import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY - database features disabled')
}

// Create Supabase client with service role key (bypasses RLS for admin operations)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Helper to get organization from API key
export async function getOrganizationFromApiKey(apiKey: string) {
  if (!apiKey) return null
  
  const { data, error } = await supabase
    .from('api_keys')
    .select('organization_id, name, scopes')
    .eq('key', apiKey)
    .eq('active', true)
    .single()

  if (error || !data) return null
  
  return {
    organizationId: data.organization_id,
    keyName: data.name,
    scopes: data.scopes
  }
}

// Helper to validate API key has required scope
export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes('*') || scopes.includes(required)
}

