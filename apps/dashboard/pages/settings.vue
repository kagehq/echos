<template>
  <div class="min-h-screen bg-black text-white">
    <AppHeader current-page="settings" />
    <div class="px-6 py-4">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-2xl font-semibold text-white mb-2">Settings</h1>
          <p class="text-gray-400 text-sm">Manage your API keys and organization settings</p>
        </div>

      <!-- API Keys Section -->
      <div class="bg-gray-500/10 rounded-lg border border-gray-500/20 p-6 mb-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-semibold mb-1">API Keys</h2>
            <p class="text-sm text-gray-400">Use these keys to authenticate with the Echos daemon</p>
          </div>
          <button 
            @click="openCreateModal"
            class="px-4 py-2 bg-blue-300 hover:bg-blue-400 text-black text-sm font-medium rounded-lg transition-colors flex items-center space-x-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create New Key</span>
          </button>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="text-center py-8">
          <div class="w-8 h-8 border-2 border-gray-500 border-t-gray-300 rounded-full animate-spin mx-auto"></div>
          <p class="text-gray-400 mt-2">Loading API keys...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div class="flex items-start">
            <svg class="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p class="font-medium text-red-500">Error loading API keys</p>
              <p class="text-sm text-red-300 mt-1">{{ error }}</p>
            </div>
          </div>
        </div>

        <!-- API Keys List -->
        <div v-else-if="apiKeys.length > 0" class="space-y-4">
          <div 
            v-for="key in apiKeys" 
            :key="key.id"
            class="bg-black border border-gray-500/20 rounded-lg p-4"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-medium">{{ key.name }}</h3>
                  <span 
                    v-if="key.active"
                    class="px-2 py-0.5 bg-green-300/10 border border-green-300/20 text-green-300 text-xs rounded-full"
                  >
                    Active
                  </span>
                  <span 
                    v-else
                    class="px-2 py-0.5 bg-gray-500/10 border border-gray-500/20 text-gray-400 text-xs rounded-full"
                  >
                    Inactive
                  </span>
                </div>
                <p class="text-xs text-gray-400">
                  Created {{ formatDate(key.created_at) }}
                  <span v-if="key.last_used_at" class="ml-2">
                    · Last used {{ formatDate(key.last_used_at) }}
                  </span>
                </p>
              </div>
              <button
                v-if="key.active"
                @click="revokeKey(key.id)"
                :disabled="revokingKeyId === key.id"
                class="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-1"
              >
                <svg v-if="revokingKeyId === key.id" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Revoke</span>
              </button>
            </div>

            <!-- API Key Display -->
            <div class="bg-gray-500/10 border border-gray-500/20 rounded-lg p-3">
              <div class="flex items-center gap-2">
                <code class="flex-1 text-sm text-gray-300 font-mono break-all">
                  {{ showKey[key.id] ? key.key : maskApiKey(key.key) }}
                </code>
                <button
                  @click="toggleKeyVisibility(key.id)"
                  class="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-500/20 rounded-lg transition-colors"
                  :title="showKey[key.id] ? 'Hide key' : 'Show key'"
                >
                  <svg v-if="showKey[key.id]" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
                <button
                  @click="copyKey(key.key)"
                  class="p-2 text-gray-400 hover:text-gray-300 hover:bg-gray-500/20 rounded-lg transition-colors"
                  title="Copy to clipboard"
                >
                  <svg v-if="copiedKey === key.key" class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Scopes -->
            <div class="mt-3">
              <p class="text-xs text-gray-500 mb-1">Scopes:</p>
              <div class="flex flex-wrap gap-1">
                <span 
                  v-for="scope in key.scopes" 
                  :key="scope"
                  class="px-2 py-0.5 bg-gray-500/20 text-xs text-gray-300 rounded"
                >
                  {{ scope }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="text-center py-12">
          <svg class="w-12 h-12 mx-auto text-gray-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <p class="text-gray-400 mb-2">No API keys found</p>
          <p class="text-sm text-gray-500 mb-4">Create your first API key to start using the Echos API</p>
          <button 
            @click="openCreateModal"
            class="inline-flex items-center space-x-2 px-4 py-2 bg-blue-300 hover:bg-blue-400 text-black text-sm font-medium rounded-lg transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Create API Key</span>
          </button>
        </div>
      </div>

      <!-- Usage Guide -->
      <div class="bg-gray-500/10 rounded-lg border border-gray-500/20 p-6">
        <h3 class="text-lg font-semibold mb-3 flex items-center">
          Using Your API Key
        </h3>
        <div class="space-y-3 text-sm text-gray-300">
          <div>
            <p class="font-medium text-white mb-1">With the SDK:</p>
            <pre class="bg-black border border-gray-500/20 rounded-lg p-3 overflow-x-auto"><code class="text-xs text-gray-300">import { EchosAgent } from '@echoshq/sdk'

const agent = new EchosAgent('my-agent', 'http://localhost:3434', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY'
  }
})</code></pre>
          </div>
          <div>
            <p class="font-medium text-white mb-1">With cURL:</p>
            <pre class="bg-black border border-gray-500/20 rounded-lg p-3 overflow-x-auto"><code class="text-xs text-gray-300">curl http://localhost:3434/events \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"</code></pre>
          </div>
          <div class="bg-blue-300/10 border border-blue-300/20 rounded-lg p-3">
            <div class="flex items-start">
              <svg class="w-5 h-5 text-blue-300 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="text-blue-300 text-xs">
                <strong>Keep your API keys secure!</strong> Don't share them or commit them to version control. 
                If a key is compromised, revoke it immediately and create a new one.
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>

    <!-- Create API Key Modal -->
    <Teleport to="body">
      <div 
        v-if="showCreateModal"
        class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4"
        @click.self="closeCreateModal"
      >
        <div class="bg-black border border-gray-500/20 rounded-lg max-w-md w-full p-6">
          <!-- Modal Header -->
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-lg font-semibold text-white">Create API Key</h3>
            <button 
              @click="closeCreateModal"
              class="text-gray-400 hover:text-gray-300 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Modal Content -->
          <div class="space-y-4">
            <!-- Name Input -->
            <div>
              <label class="block text-sm font-medium text-white mb-2">
                Key Name
              </label>
              <input
                v-model="newKeyName"
                type="text"
                placeholder="e.g., Production Server, CI/CD Pipeline"
                class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-300/20 focus:border-blue-300/20"
                @keyup.enter="createNewKey"
                autofocus
              />
              <p class="text-xs text-gray-400 mt-1">Choose a descriptive name to identify this key</p>
            </div>

            <!-- Access Level Selection -->
            <div>
              <label class="block text-sm font-medium text-white mb-2">
                Access Level
              </label>
              <div class="space-y-2">
                <label 
                  class="flex items-start p-3 border rounded-lg cursor-pointer transition-colors"
                  :class="newKeyAccessLevel === 'full' ? 'border-blue-300/20 bg-blue-300/10' : 'border-gray-500/20 hover:bg-gray-500/5'"
                >
                  <input 
                    type="radio" 
                    v-model="newKeyAccessLevel" 
                    value="full"
                    class="mt-1 mr-3"
                  />
                  <div class="flex-1">
                    <div class="text-white font-medium text-sm">Full Access</div>
                    <div class="text-xs text-gray-400 mt-0.5">Can read and modify all resources</div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      <span class="px-1.5 py-0.5 bg-gray-500/20 text-gray-300 text-xs rounded font-mono">*</span>
                    </div>
                  </div>
                </label>
                
                <label 
                  class="flex items-start p-3 border rounded-lg cursor-pointer transition-colors"
                  :class="newKeyAccessLevel === 'readonly' ? 'border-blue-300/20 bg-blue-300/10' : 'border-gray-500/20 hover:bg-gray-500/5'"
                >
                  <input 
                    type="radio" 
                    v-model="newKeyAccessLevel" 
                    value="readonly"
                    class="mt-1 mr-3"
                  />
                  <div class="flex-1">
                    <div class="text-white font-medium text-sm">Read Only</div>
                    <div class="text-xs text-gray-400 mt-0.5">Can only view agents, events, and policies</div>
                    <div class="mt-1.5 flex flex-wrap gap-1">
                      <span class="px-1.5 py-0.5 bg-gray-500/20 text-gray-300 text-xs rounded font-mono">agents:read</span>
                      <span class="px-1.5 py-0.5 bg-gray-500/20 text-gray-300 text-xs rounded font-mono">events:read</span>
                      <span class="px-1.5 py-0.5 bg-gray-500/20 text-gray-300 text-xs rounded font-mono">policies:read</span>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Info Box -->
            <div class="bg-blue-300/10 border border-blue-300/20 rounded-lg p-3">
              <div class="flex items-start">
                <svg class="w-4 h-4 text-blue-300 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p class="text-blue-300 text-xs">
                  The API key will be shown only once after creation. Make sure to copy it to a safe place.
                </p>
              </div>
            </div>
          </div>

          <!-- Modal Actions -->
          <div class="flex items-center justify-end space-x-3 mt-6">
            <button
              @click="closeCreateModal"
              :disabled="creating"
              class="px-4 py-2 text-sm border border-gray-500/20 rounded-lg text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              @click="createNewKey"
              :disabled="creating || !newKeyName.trim()"
              class="px-4 py-2 bg-blue-300 hover:bg-blue-400 disabled:bg-blue-300/50 disabled:cursor-not-allowed text-black text-sm font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <svg v-if="creating" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{{ creating ? 'Creating...' : 'Create Key' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApiKeys } from '~/composables/useApiKeys'

definePageMeta({
  middleware: 'auth'
})

useHead({
  title: 'Settings - Echos',
  meta: [
    { name: 'description', content: 'Manage your API keys and organization settings' }
  ]
})

const { 
  loading, 
  error, 
  listApiKeys, 
  createApiKey, 
  revokeApiKey: revokeApiKeyFn 
} = useApiKeys()

const toast = useToast()

const apiKeys = ref<any[]>([])
const showKey = ref<Record<string, boolean>>({})
const copiedKey = ref<string | null>(null)
const creating = ref(false)
const revokingKeyId = ref<string | null>(null)

// Modal state
const showCreateModal = ref(false)
const newKeyName = ref('')
const newKeyAccessLevel = ref<'full' | 'readonly'>('full')

// Load API keys on mount
onMounted(async () => {
  await loadKeys()
})

async function loadKeys() {
  const keys = await listApiKeys()
  apiKeys.value = keys
}

function maskApiKey(key: string): string {
  if (key.length < 16) return key
  const start = key.substring(0, 12)
  const end = key.substring(key.length - 4)
  return `${start}${'•'.repeat(20)}${end}`
}

function toggleKeyVisibility(keyId: string) {
  showKey.value[keyId] = !showKey.value[keyId]
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key)
    copiedKey.value = key
    toast.add({
      title: 'API key copied to clipboard',
      color: 'green',
      icon: 'i-heroicons-check-circle'
    })
    setTimeout(() => {
      copiedKey.value = null
    }, 2000)
  } catch (err) {
    toast.add({
      title: 'Failed to copy to clipboard',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  }
}

function openCreateModal() {
  newKeyName.value = ''
  newKeyAccessLevel.value = 'full'
  showCreateModal.value = true
}

function closeCreateModal() {
  showCreateModal.value = false
  newKeyName.value = ''
  newKeyAccessLevel.value = 'full'
}

async function createNewKey() {
  if (!newKeyName.value.trim()) {
    toast.add({
      title: 'Name required',
      description: 'Please enter a name for your API key',
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
    return
  }

  creating.value = true
  try {
    // Determine scopes based on access level
    const scopes = newKeyAccessLevel.value === 'readonly' 
      ? ['agents:read', 'events:read', 'policies:read', 'templates:read']
      : ['*']

    const newKey = await createApiKey(newKeyName.value.trim(), scopes)
    if (newKey) {
      toast.add({
        title: 'API key created',
        description: 'Your new API key has been created successfully',
        color: 'green',
        icon: 'i-heroicons-check-circle'
      })
      await loadKeys()
      closeCreateModal()
      // Auto-show and copy the new key
      showKey.value[newKey.id] = true
      await copyKey(newKey.key)
    } else {
      throw new Error(error.value || 'Failed to create API key')
    }
  } catch (err: any) {
    toast.add({
      title: 'Failed to create API key',
      description: err.message,
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    creating.value = false
  }
}

async function revokeKey(keyId: string) {
  if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
    return
  }

  revokingKeyId.value = keyId
  try {
    const success = await revokeApiKeyFn(keyId)
    if (success) {
      toast.add({
        title: 'API key revoked',
        description: 'The API key has been revoked successfully',
        color: 'green',
        icon: 'i-heroicons-check-circle'
      })
      await loadKeys()
    } else {
      throw new Error(error.value || 'Failed to revoke API key')
    }
  } catch (err: any) {
    toast.add({
      title: 'Failed to revoke API key',
      description: err.message,
      color: 'red',
      icon: 'i-heroicons-x-circle'
    })
  } finally {
    revokingKeyId.value = null
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}
</script>

