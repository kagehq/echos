import { ref } from 'vue'

export type ApiKey = {
  id: string
  name: string
  key: string
  scopes: string[]
  active: boolean
  created_at: string
  last_used_at?: string
}

export const useApiKeys = () => {
  const supabase = useSupabaseClient()
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Get or create a default API key for the current user's organization
   */
  const getOrCreateDefaultApiKey = async (): Promise<string | null> => {
    try {
      loading.value = true
      error.value = null

      // Wait for session to load
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        console.warn('[useApiKeys] No user authenticated')
        error.value = 'Not authenticated'
        return null
      }

      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', session.user.id)
        .single()

      if (!profile?.organization_id) {
        console.warn('[useApiKeys] No organization found in profile')
        error.value = 'No organization found'
        return null
      }

      // Check if an API key already exists
      const { data: existingKeys, error: existingError } = await supabase
        .from('api_keys')
        .select('key')
        .eq('organization_id', profile.organization_id)
        .eq('active', true)
        .limit(1)

      if (existingKeys && existingKeys.length > 0) {
        return existingKeys[0].key
      }

      // Create a new API key
      const newKey = `echos_${crypto.randomUUID().replace(/-/g, '')}`
      
      const { data: newApiKey, error: createError } = await supabase
        .from('api_keys')
        .insert({
          organization_id: profile.organization_id,
          name: 'Dashboard Key',
          key: newKey,
          scopes: ['*'],
          active: true,
          created_by: session.user.id
        })
        .select('key')
        .single()

      if (createError) {
        console.error('[useApiKeys] ❌ Error creating API key:', createError)
        error.value = createError.message
        return null
      }

      return newApiKey.key
    } catch (err: any) {
      console.error('[useApiKeys] ❌ Error in getOrCreateDefaultApiKey:', err)
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * List all API keys for the current organization
   */
  const listApiKeys = async (): Promise<ApiKey[]> => {
    try {
      loading.value = true
      error.value = null

      // Wait for session to load
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        console.warn('[useApiKeys] No user authenticated')
        error.value = 'Not authenticated'
        return []
      }

      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.error('[useApiKeys] Error fetching profile:', profileError)
        error.value = profileError.message
        return []
      }

      if (!profile?.organization_id) {
        console.warn('[useApiKeys] No organization found in profile')
        error.value = 'No organization found'
        return []
      }

      // Fetch API keys for the organization
      const { data, error: fetchError } = await supabase
        .from('api_keys')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })

      if (fetchError) {
        console.error('[useApiKeys] Error fetching API keys:', fetchError)
        error.value = fetchError.message
        return []
      }

      return data || []
    } catch (err: any) {
      console.error('[useApiKeys] Error in listApiKeys:', err)
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new API key
   */
  const createApiKey = async (name: string, scopes: string[] = ['*']): Promise<ApiKey | null> => {
    try {
      loading.value = true
      error.value = null

      // Wait for session to load
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        console.warn('[useApiKeys] No user authenticated')
        error.value = 'Not authenticated'
        return null
      }

      // Get user's organization
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', session.user.id)
        .single()

      if (profileError) {
        console.error('[useApiKeys] Error fetching profile:', profileError)
        error.value = profileError.message
        return null
      }

      if (!profile?.organization_id) {
        console.warn('[useApiKeys] No organization found')
        error.value = 'No organization found'
        return null
      }

      const newKey = `echos_${crypto.randomUUID().replace(/-/g, '')}`
      
      const { data, error: createError } = await supabase
        .from('api_keys')
        .insert({
          organization_id: profile.organization_id,
          name,
          key: newKey,
          scopes,
          active: true,
          created_by: session.user.id
        })
        .select()
        .single()

      if (createError) {
        console.error('[useApiKeys] Error creating API key:', createError)
        error.value = createError.message
        return null
      }

      console.log('[useApiKeys] ✓ API key created successfully')
      return data
    } catch (err: any) {
      console.error('[useApiKeys] Error in createApiKey:', err)
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Update an API key
   */
  const updateApiKey = async (keyId: string, updates: Partial<ApiKey>): Promise<boolean> => {
    try {
      loading.value = true
      error.value = null

      const { error: updateError } = await supabase
        .from('api_keys')
        .update(updates)
        .eq('id', keyId)

      if (updateError) {
        error.value = updateError.message
        return false
      }

      return true
    } catch (err: any) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Revoke an API key
   */
  const revokeApiKey = async (keyId: string): Promise<boolean> => {
    return updateApiKey(keyId, { active: false })
  }

  /**
   * Delete an API key
   */
  const deleteApiKey = async (keyId: string): Promise<boolean> => {
    try {
      loading.value = true
      error.value = null

      const { error: deleteError } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)

      if (deleteError) {
        error.value = deleteError.message
        return false
      }

      return true
    } catch (err: any) {
      error.value = err.message
      return false
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    getOrCreateDefaultApiKey,
    listApiKeys,
    createApiKey,
    updateApiKey,
    revokeApiKey,
    deleteApiKey
  }
}

