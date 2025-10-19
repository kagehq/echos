<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

defineProps<{
  currentPage: 'feed' | 'timeline' | 'metrics' | 'roles' | 'devtools' | 'settings'
}>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { organization, loading } = useOrganization()
const dropdownOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// Get user email from session
const userEmail = computed(() => user.value?.email || '')

// Helper function to get initials from email
const getInitials = (email: string) => {
  if (!email) return '?'
  const name = email.split('@')[0]
  return name.slice(0, 2).toUpperCase()
}

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    dropdownOpen.value = false
  }
}

// Add/remove event listener
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

const handleLogout = async () => {
  const { reset } = useOrganization()
  reset() // Clear cached organization data
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <header class="p-4 py-2 border-b border-gray-500/20 flex items-center justify-between shrink-0">
    <h1 class="text-lg space-x-2 flex items-center">
      <div class="flex items-center gap-1">
        <img src="~/assets/img/logo.png" alt="Echos" class="w-6 h-6" />
      </div>
      <span class="text-gray-500/40 text-sm">/</span>
      <!-- Organization Name -->
      <div v-if="!loading && organization" class="text-xs text-white font-medium">
        {{ organization.name }}
      </div>
     <span class="text-gray-500/40 text-sm">/</span>
      <nav class="text-xs flex items-center gap-2 bg-gray-500/5 border border-gray-500/20 rounded-xl p-0.5 px-0.5">
        <NuxtLink 
          to="/" 
          :class="currentPage === 'feed' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Feed
        </NuxtLink>
        <NuxtLink 
          to="/timeline" 
          :class="currentPage === 'timeline' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Timeline
        </NuxtLink>
        <NuxtLink 
          to="/metrics" 
          :class="currentPage === 'metrics' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Metrics
        </NuxtLink>
        <NuxtLink 
          to="/roles" 
          :class="currentPage === 'roles' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Roles
        </NuxtLink>
        <NuxtLink 
          to="/devtools" 
          :class="currentPage === 'devtools' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          DevTools
        </NuxtLink>
        <NuxtLink 
          to="/settings" 
          :class="currentPage === 'settings' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Settings
        </NuxtLink>
      </nav>
    </h1>
    
    <!-- Organization and User Actions -->
    <div class="flex items-center gap-3">
      <!-- Page-specific actions slot -->
      <slot name="actions"></slot>
      
      
      <!-- User Avatar Dropdown -->
      <div v-if="user && userEmail" class="relative" ref="dropdownRef">
        <button 
          @click="dropdownOpen = !dropdownOpen"
          class="flex items-center justify-center w-7 h-7 rounded-full bg-amber-400/40 text-white text-xs font-medium hover:shadow-lg transition-shadow border border-gray-500/20"
        >
          {{ getInitials(userEmail) }}
        </button>

        <!-- Dropdown Menu -->
        <transition
          enter-active-class="transition ease-out duration-100"
          enter-from-class="transform opacity-0 scale-95"
          enter-to-class="transform opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75"
          leave-from-class="transform opacity-100 scale-100"
          leave-to-class="transform opacity-0 scale-95"
        >
          <div 
            v-if="dropdownOpen"
            class="absolute right-0 mt-2 w-56 bg-black border border-gray-500/20 rounded-xl shadow-xl p-1 z-50"
          >
            <!-- User Info -->
            <div class="px-3 py-2 border-b border-gray-500/20">
              <p class="truncate font-medium text-white text-xs">
                {{ userEmail }}
              </p>
              <p v-if="organization" class="truncate text-gray-500 text-xs mt-1">
                {{ organization.name }}
              </p>
            </div>

            <!-- Logout Button -->
            <button
              @click="handleLogout"
              class="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:bg-gray-500/10 hover:text-white rounded-lg transition-colors mt-1"
            >
              <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

