import { ref } from 'vue'
import { useApiKeys } from './useApiKeys'

export const useDaemon = () => {
  const config = useRuntimeConfig()
  const { getOrCreateDefaultApiKey } = useApiKeys()
  const daemonUrl = config.public.daemonUrl
  const apiKey = ref<string | null>(null)

  /**
   * Initialize the daemon client by getting/creating an API key
   */
  const init = async () => {
    if (!apiKey.value) {
      apiKey.value = await getOrCreateDefaultApiKey()
    }
    return !!apiKey.value
  }

  /**
   * Make an authenticated request to the daemon
   */
  const request = async <T = any>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    // Ensure we have an API key
    if (!apiKey.value) {
      await init()
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers
    }

    // Add API key if available
    if (apiKey.value) {
      headers['Authorization'] = `Bearer ${apiKey.value}`
    }

    const response = await fetch(`${daemonUrl}${endpoint}`, {
      ...options,
      headers
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || error.message || 'Request failed')
    }

    return response.json()
  }

  /**
   * Fetch events from the daemon
   */
  const getEvents = async () => {
    return request('/events')
  }

  /**
   * Fetch timeline events
   */
  const getTimeline = async () => {
    return request('/timeline')
  }

  /**
   * Get role for an agent
   */
  const getRole = async (agentId: string) => {
    return request(`/roles/${agentId}`)
  }

  /**
   * List all roles
   */
  const listRoles = async () => {
    return request('/roles')
  }

  /**
   * Apply a role to an agent
   */
  const applyRole = async (agentId: string, template: string, overrides?: any) => {
    return request('/roles/apply', {
      method: 'POST',
      body: JSON.stringify({ agentId, template, overrides })
    })
  }

  /**
   * Get LLM metrics
   */
  const getMetrics = async () => {
    return request('/metrics/llm')
  }

  /**
   * List templates
   */
  const listTemplates = async () => {
    return request('/templates')
  }

  return {
    init,
    request,
    getEvents,
    getTimeline,
    getRole,
    listRoles,
    applyRole,
    getMetrics,
    listTemplates
  }
}

