import type { H3Event } from 'h3'
import { getOrganizationFromApiKey, hasScope } from './supabase.js'

export type AuthContext = {
  organizationId: string
  keyName: string
  scopes: string[]
}

/**
 * Extract API key from request headers
 * Supports: Authorization: Bearer <key> or X-API-Key: <key>
 */
export function getApiKeyFromRequest(event: H3Event): string | null {
  const authHeader = event.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  
  const apiKeyHeader = event.headers.get('x-api-key')
  if (apiKeyHeader) {
    return apiKeyHeader
  }
  
  return null
}

/**
 * Authenticate request and return organization context
 * Returns null if authentication fails
 */
export async function authenticateRequest(event: H3Event): Promise<AuthContext | null> {
  const apiKey = getApiKeyFromRequest(event)
  
  if (!apiKey) {
    return null
  }
  
  const auth = await getOrganizationFromApiKey(apiKey)
  
  if (!auth) {
    return null
  }
  
  return {
    organizationId: auth.organizationId,
    keyName: auth.keyName,
    scopes: auth.scopes
  }
}

/**
 * Require authentication for a request
 * Returns 401 if not authenticated
 */
export async function requireAuth(event: H3Event, requiredScope?: string): Promise<AuthContext | Response> {
  const auth = await authenticateRequest(event)
  
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized', message: 'Valid API key required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  if (requiredScope && !hasScope(auth.scopes, requiredScope)) {
    return new Response(JSON.stringify({ error: 'Forbidden', message: `Required scope: ${requiredScope}` }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  return auth
}

