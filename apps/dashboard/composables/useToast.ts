export function useToast() {
  // Get the native Nuxt UI toast
  const nuxtApp = useNuxtApp()
  const nuxtToast = nuxtApp.$toast as any

  // Safety check
  if (!nuxtToast) {
    console.warn('[useToast] Toast not available, using console fallback')
    return {
      add: (notification: any) => console.log('[Toast]', notification),
      remove: () => {},
      update: () => {},
      clear: () => {},
      error: (message: string) => console.error('[Toast Error]', message),
      success: (message: string) => console.log('[Toast Success]', message),
      warning: (message: string) => console.warn('[Toast Warning]', message),
      info: (message: string) => console.info('[Toast Info]', message)
    }
  }

  // Create wrapper object with helper methods
  const toastHelpers = {
    // Pass through original methods
    add: nuxtToast.add.bind(nuxtToast),
    remove: nuxtToast.remove.bind(nuxtToast),
    update: nuxtToast.update?.bind(nuxtToast),
    clear: nuxtToast.clear?.bind(nuxtToast),
    
    // Helper methods for common use cases
    error: (message: string, description?: string) => {
      nuxtToast.add({
        title: message,
        description,
        color: 'red',
        icon: 'i-heroicons-x-circle'
      })
    },
    
    success: (message: string, description?: string) => {
      nuxtToast.add({
        title: message,
        description,
        color: 'green',
        icon: 'i-heroicons-check-circle'
      })
    },
    
    warning: (message: string, description?: string) => {
      nuxtToast.add({
        title: message,
        description,
        color: 'amber',
        icon: 'i-heroicons-exclamation-triangle'
      })
    },
    
    info: (message: string, description?: string) => {
      nuxtToast.add({
        title: message,
        description,
        color: 'blue',
        icon: 'i-heroicons-information-circle'
      })
    }
  }

  return toastHelpers
}

