import { ref, computed, watch } from 'vue'
import type { Database } from '~/types/supabase'

type Organization = Database['public']['Tables']['organizations']['Row']

// Shared state across all instances
const organization = ref<Organization | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const initialized = ref(false)

export function useOrganization() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  // Load organization (only once)
  const loadOrganization = async () => {
    // If already loaded or loading, don't refetch
    if (initialized.value || loading.value) {
      return organization.value
    }

    loading.value = true
    error.value = null

    try {
      // Wait for session to load
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user) {
        initialized.value = true
        loading.value = false
        return null
      }

      // Get the profile with organization_id
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', session.user.id)
        .single()

      if (profileError) throw profileError

      if (profileData?.organization_id) {
        // Get the organization
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('*')
          .eq('id', profileData.organization_id)
          .single()

        if (orgError) throw orgError
        
        organization.value = orgData
        initialized.value = true
        return orgData
      }

      initialized.value = true
      return null
    } catch (err) {
      console.error('[useOrganization] Error loading organization:', err)
      error.value = err instanceof Error ? err.message : 'Failed to load organization'
      initialized.value = true
      return null
    } finally {
      loading.value = false
    }
  }

  // Watch for user to become available and load organization
  watch(
    () => user.value,
    (newUser) => {
      if (newUser && !initialized.value && !loading.value) {
        loadOrganization()
      }
    },
    { immediate: true }
  )

  // Reset function for when user logs out
  const reset = () => {
    organization.value = null
    loading.value = false
    error.value = null
    initialized.value = false
  }

  return {
    organization: computed(() => organization.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    initialized: computed(() => initialized.value),
    loadOrganization,
    reset
  }
}

