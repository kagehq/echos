<script setup lang="ts">
import { onMounted, ref } from 'vue'

definePageMeta({
  layout: 'auth',
})

const supabase = useSupabaseClient()
const status = ref<'verifying' | 'creating' | 'success' | 'error'>('verifying')
const errorMessage = ref('')

onMounted(async () => {
  try {
    // Get the current user after email confirmation
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user) {
      throw new Error('No user found after verification')
    }

    // Check if organization already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (existingProfile?.organization_id) {
      // Organization already exists, redirect to dashboard
      status.value = 'success'
      await navigateTo('/')
      return
    }

    // Create organization from user metadata
    status.value = 'creating'
    const metadata = user.user_metadata
    const orgName = metadata.organization_name || 'My Organization'
    const orgSlug = metadata.organization_slug || orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

    const { error: orgError } = await supabase.rpc(
      'create_organization_with_owner',
      {
        org_name: orgName,
        org_slug: orgSlug,
        user_id: user.id,
        user_email: user.email!,
        user_name: metadata.full_name || null
      }
    )

    if (orgError) throw orgError

    // Success! Redirect to dashboard
    status.value = 'success'
    setTimeout(() => {
      navigateTo('/')
    }, 1500)

  } catch (err: any) {
    console.error('Callback error:', err)
    status.value = 'error'
    errorMessage.value = err.message || 'Failed to complete setup'
  }
})
</script>

<template>
  <div class="min-h-screen bg-black flex items-center justify-center px-4">
    <div class="max-w-md w-full text-center">
      <!-- Logo -->
      <div class="mb-8">
        <img src="~/assets/img/logo.png" alt="Echos" class="w-14 h-14 mx-auto">
      </div>

      <!-- Verifying -->
      <div v-if="status === 'verifying'" class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
        <h2 class="text-xl font-semibold text-white mb-2">Verifying your email...</h2>
        <p class="text-gray-400 text-sm">Please wait a moment</p>
      </div>

      <!-- Creating Organization -->
      <div v-if="status === 'creating'" class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
        <h2 class="text-xl font-semibold text-white mb-2">Setting up your organization...</h2>
        <p class="text-gray-400 text-sm">Almost there!</p>
      </div>

      <!-- Success -->
      <div v-if="status === 'success'" class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
        <div class="mb-4">
          <svg class="w-16 h-16 mx-auto text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-white mb-2">All set!</h2>
        <p class="text-gray-400 text-sm">Redirecting to your dashboard...</p>
      </div>

      <!-- Error -->
      <div v-if="status === 'error'" class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
        <div class="mb-4">
          <svg class="w-16 h-16 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>
        <h2 class="text-xl font-semibold text-white mb-2">Setup Failed</h2>
        <p class="text-gray-400 text-sm mb-6">{{ errorMessage }}</p>
        <NuxtLink 
          to="/login"
          class="inline-block bg-blue-300 hover:bg-blue-400 text-black font-medium py-2.5 px-6 rounded-lg transition-colors text-sm"
        >
          Go to Login
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

