import { ref } from 'vue'

const DEFAULT_TIMEOUT = 5000 // 5 seconds

// Helper to get daemon base URL from runtime config
function getDaemonBaseUrl(): string {
  try {
    const config = useRuntimeConfig()
    return config.public.daemonUrl || 'http://127.0.0.1:3434'
  } catch {
    // Fallback if runtime config is not available
    return 'http://127.0.0.1:3434'
  }
}

export interface DaemonApiOptions {
  timeout?: number
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  signal?: AbortSignal
}

export class DaemonTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DaemonTimeoutError'
  }
}

export class DaemonConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DaemonConnectionError'
  }
}

// Store API key in memory (will be set by useDaemonApi)
let cachedApiKey: string | null = null

/**
 * Set the API key for daemon requests
 */
export function setDaemonApiKey(apiKey: string | null) {
  cachedApiKey = apiKey
}

/**
 * Make a request to the daemon with timeout protection and API key authentication
 */
export async function daemonRequest<T = any>(
  endpoint: string, 
  options: DaemonApiOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, method = 'GET', body } = options
  
  // Get the daemon base URL dynamically
  const DAEMON_BASE_URL = getDaemonBaseUrl()
  
  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    // Add API key if available
    if (cachedApiKey) {
      headers['Authorization'] = `Bearer ${cachedApiKey}`
    }

    const response = await fetch(`${DAEMON_BASE_URL}${endpoint}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      headers,
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    return data as T
  } catch (error: any) {
    // Handle abort/timeout
    if (error.name === 'AbortError' || controller.signal.aborted) {
      throw new DaemonTimeoutError(
        `Request to ${endpoint} timed out after ${timeout}ms`
      )
    }
    
    // Handle network/connection errors
    if (error.cause?.code === 'ECONNREFUSED' || 
        error.message?.includes('fetch failed') ||
        error.message?.includes('Failed to fetch') ||
        error.message?.includes('ECONNREFUSED')) {
      throw new DaemonConnectionError(
        `Cannot connect to daemon at ${DAEMON_BASE_URL}`
      )
    }
    
    // Re-throw other errors
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Composable for managing daemon API state with API key authentication
 */
export function useDaemonApi() {
  const daemonError = ref(false)
  const isConnected = ref(false)
  const apiKeyInitialized = ref(false)
  
  /**
   * Initialize API key from Supabase
   */
  async function initApiKey() {
    if (apiKeyInitialized.value) {
      return true
    }
    
    try{
      // Dynamically import to avoid circular dependencies
      const { useApiKeys } = await import('./useApiKeys')
      const { getOrCreateDefaultApiKey } = useApiKeys()
      
      const apiKey = await getOrCreateDefaultApiKey()
      
      if (apiKey) {
        setDaemonApiKey(apiKey)
        apiKeyInitialized.value = true
        return true
      }
      console.warn('[useDaemonApi] ❌ Failed to get API key')
      return false
    } catch (error) {
      console.error('[useDaemonApi] ❌ Failed to initialize API key:', error)
      return false
    }
  }
  
  /**
   * Make a daemon request and automatically update connection state
   */
  async function request<T = any>(
    endpoint: string,
    options: DaemonApiOptions = {}
  ): Promise<T | null> {
    // Initialize API key if needed
    await initApiKey()
    
    try {
      const result = await daemonRequest<T>(endpoint, options)
      daemonError.value = false
      isConnected.value = true
      return result
    } catch (error) {
      if (error instanceof DaemonTimeoutError || 
          error instanceof DaemonConnectionError) {
        console.error('Daemon error:', error.message)
        daemonError.value = true
        isConnected.value = false
      } else {
        console.error('Unexpected error:', error)
      }
      return null
    }
  }
  
  /**
   * Check daemon health
   */
  async function checkHealth(): Promise<boolean> {
    await initApiKey()
    
    try {
      await daemonRequest('/tokens/list', { timeout: 3000 })
      daemonError.value = false
      isConnected.value = true
      return true
    } catch {
      daemonError.value = true
      isConnected.value = false
      return false
    }
  }
  
  return {
    daemonError,
    isConnected,
    apiKeyInitialized,
    initApiKey,
    request,
    checkHealth,
    daemonRequest, // Export for direct use
  }
}

