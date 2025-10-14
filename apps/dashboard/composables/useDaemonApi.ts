import { ref } from 'vue'

const DAEMON_BASE_URL = 'http://127.0.0.1:3434'
const DEFAULT_TIMEOUT = 5000 // 5 seconds

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

/**
 * Make a request to the daemon with timeout protection
 */
export async function daemonRequest<T = any>(
  endpoint: string, 
  options: DaemonApiOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT, method = 'GET', body } = options
  
  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await $fetch<T>(`${DAEMON_BASE_URL}${endpoint}`, {
      method,
      body,
      signal: controller.signal,
      // Disable automatic retry on error
      retry: false,
    })
    
    return response
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
 * Composable for managing daemon API state
 */
export function useDaemonApi() {
  const daemonError = ref(false)
  const isConnected = ref(false)
  
  /**
   * Make a daemon request and automatically update connection state
   */
  async function request<T = any>(
    endpoint: string,
    options: DaemonApiOptions = {}
  ): Promise<T | null> {
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
    request,
    checkHealth,
    daemonRequest, // Export for direct use
  }
}

