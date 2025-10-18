<script setup lang="ts">
import { ref, onMounted } from 'vue'

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Dashboard - Echos',
})

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const profile = ref<any>(null)
const organization = ref<any>(null)
const loading = ref(true)

// Load user profile and organization
onMounted(async () => {
  if (!user.value) return

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, organization:organizations(*)')
      .eq('id', user.value.id)
      .single()

    if (error) throw error
    
    profile.value = data
    organization.value = data.organization
  } catch (err) {
    console.error('Error loading profile:', err)
  } finally {
    loading.value = false
  }
})

const handleLogout = async () => {
  await supabase.auth.signOut()
  await navigateTo('/auth/login')
}
</script>

<template>
  <div class="h-screen bg-black flex flex-col">
    <!-- Header -->
    <header class="border-b border-gray-800 bg-gray-900">
      <div class="px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold text-white">Echos Dashboard</h1>
            <p v-if="organization" class="text-sm text-gray-400">{{ organization.name }}</p>
          </div>
          
          <div class="flex items-center gap-4">
            <div v-if="profile" class="text-right">
              <p class="text-sm text-white">{{ profile.full_name || profile.email }}</p>
              <p class="text-xs text-gray-400">{{ profile.role }}</p>
            </div>
            <button
              @click="handleLogout"
              class="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 overflow-auto px-6 py-8">
      <div v-if="loading" class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p class="text-gray-400 mt-4">Loading...</p>
        </div>
      </div>

      <div v-else class="max-w-4xl mx-auto">
        <!-- Welcome Card -->
        <div class="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-8 mb-8">
          <h2 class="text-2xl font-bold text-white mb-2">
            Welcome to Echos! 🎉
          </h2>
          <p class="text-gray-300 mb-4">
            Your multi-tenant SaaS platform is ready. Here's what you can do:
          </p>
        </div>

        <!-- Features Grid -->
        <div class="grid md:grid-cols-2 gap-6">
          <!-- Organization Info -->
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 class="text-lg font-semibold text-white mb-4">Organization</h3>
            <div class="space-y-3">
              <div>
                <p class="text-sm text-gray-400">Name</p>
                <p class="text-white">{{ organization?.name }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-400">Plan</p>
                <p class="text-white capitalize">{{ organization?.plan }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-400">Status</p>
                <span class="inline-block px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                  {{ organization?.status }}
                </span>
              </div>
            </div>
          </div>

          <!-- User Profile -->
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h3 class="text-lg font-semibold text-white mb-4">Your Profile</h3>
            <div class="space-y-3">
              <div>
                <p class="text-sm text-gray-400">Name</p>
                <p class="text-white">{{ profile?.full_name || 'Not set' }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-400">Email</p>
                <p class="text-white">{{ profile?.email }}</p>
              </div>
              <div>
                <p class="text-sm text-gray-400">Role</p>
                <span class="inline-block px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded capitalize">
                  {{ profile?.role }}
                </span>
              </div>
            </div>
          </div>

          <!-- Next Steps -->
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-6 md:col-span-2">
            <h3 class="text-lg font-semibold text-white mb-4">Next Steps</h3>
            <ul class="space-y-3">
              <li class="flex items-start gap-3">
                <span class="text-blue-400">✓</span>
                <div>
                  <p class="text-white font-medium">Phase 1 Complete!</p>
                  <p class="text-sm text-gray-400">Authentication and organization management is working</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <span class="text-gray-500">○</span>
                <div>
                  <p class="text-white font-medium">Phase 2: Multi-Tenant Agents</p>
                  <p class="text-sm text-gray-400">Move agents from files to database</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <span class="text-gray-500">○</span>
                <div>
                  <p class="text-white font-medium">Phase 3: Events & Monitoring</p>
                  <p class="text-sm text-gray-400">Store events in database for analytics</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <span class="text-gray-500">○</span>
                <div>
                  <p class="text-white font-medium">Phase 4: API Keys</p>
                  <p class="text-sm text-gray-400">Enable programmatic access</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Legacy Dashboard Link -->
        <div class="mt-8 text-center">
          <NuxtLink 
            to="/" 
            class="text-blue-400 hover:text-blue-300 text-sm"
          >
            ← Back to legacy dashboard (file-based mode)
          </NuxtLink>
        </div>
      </div>
    </main>
  </div>
</template>

