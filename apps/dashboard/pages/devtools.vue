<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDaemonApi } from '~/composables/useDaemonApi'
import { useToast } from '~/composables/useToast'

definePageMeta({
  ssr: false
})

useHead({
  title: 'DevTools - Echos',
  meta: [
    { name: 'description', content: 'Policy testing, template validation, and debugging tools' }
  ]
})

const { request, daemonError } = useDaemonApi()
const { error: showError, success: showSuccess, warning: showWarning } = useToast()

// Policy Testing
const policyTestAgent = ref('test-agent')
const policyTestIntent = ref('email.send')
const policyTestTarget = ref('user@example.com')
const customPolicy = ref('')
const useCustomPolicy = ref(false)
const testResult = ref<any>(null)
const testing = ref(false)

// Template Validation
const yamlTemplate = ref(`name: My Custom Template
version: 1
description: A custom policy template
allow:
  - llm.chat:*
  - http.request:GET*
ask:
  - email.send:*
block:
  - fs.delete:*
`)
const validationResult = ref<any>(null)
const validating = ref(false)

// Webhooks
const webhooks = ref<string[]>([])
const newWebhookUrl = ref('')
const loadingWebhooks = ref(false)

async function testPolicy() {
  testing.value = true
  testResult.value = null
  
  try {
    const body: any = {
      agent: policyTestAgent.value,
      intent: policyTestIntent.value,
      target: policyTestTarget.value || undefined
    }
    
    if (useCustomPolicy.value && customPolicy.value) {
      try {
        const policy = JSON.parse(customPolicy.value)
        body.policy = policy
      } catch (e) {
        showError('Invalid JSON in custom policy')
        testing.value = false
        return
      }
    }
    
    console.log('[DevTools] Testing policy:', body)
    const result = await request<any>('/policy/test', {
      method: 'POST',
      body
    })
    console.log('[DevTools] Policy test result:', result)
    
    if (result) {
      testResult.value = result
      if (result.ok) {
        const color = result.status === 'allow' ? 'success' : result.status === 'ask' ? 'warning' : 'error'
        if (color === 'success') showSuccess(`Policy test: ${result.status}`)
        else if (color === 'warning') showWarning(`Policy test: ${result.status}`)
        else showError(`Policy test: ${result.status}`)
      } else {
        showError(result.error || 'Policy test failed')
      }
    }
  } catch (e) {
    showError('Failed to test policy')
  } finally {
    testing.value = false
  }
}

async function validateTemplate() {
  validating.value = true
  validationResult.value = null
  
  try {
    console.log('[DevTools] Validating template, length:', yamlTemplate.value.length)
    const result = await request<any>('/templates/validate', {
      method: 'POST',
      body: { yaml: yamlTemplate.value }
    })
    console.log('[DevTools] Validation result:', result)
    
    if (result) {
      validationResult.value = result
      if (result.valid) {
        showSuccess('Template is valid!')
      } else {
        showError(`Template validation failed: ${result.errors.join(', ')}`)
      }
    }
  } catch (e) {
    showError('Failed to validate template')
  } finally {
    validating.value = false
  }
}

async function loadWebhooks() {
  loadingWebhooks.value = true
  try {
    const result = await request<{ webhooks: string[] }>('/webhooks')
    if (result) {
      webhooks.value = result.webhooks || []
    }
  } catch (e) {
    showError('Failed to load webhooks')
  } finally {
    loadingWebhooks.value = false
  }
}

async function addWebhook() {
  if (!newWebhookUrl.value || !newWebhookUrl.value.startsWith('http')) {
    showError('Please enter a valid webhook URL starting with http:// or https://')
    return
  }
  
  try {
    const result = await request<{ ok: boolean; webhooks: string[] }>('/webhooks', {
      method: 'POST',
      body: { url: newWebhookUrl.value }
    })
    
    if (result?.ok) {
      webhooks.value = result.webhooks || []
      newWebhookUrl.value = ''
      showSuccess('Webhook added')
    } else {
      showError('Failed to add webhook')
    }
  } catch (e) {
    showError('Failed to add webhook')
  }
}

async function removeWebhook(url: string) {
  try {
    const result = await request<{ ok: boolean; webhooks: string[] }>('/webhooks', {
      method: 'DELETE',
      body: { url }
    })
    
    if (result?.ok) {
      webhooks.value = result.webhooks || []
      showSuccess('Webhook removed')
    } else {
      showError('Failed to remove webhook')
    }
  } catch (e) {
    showError('Failed to remove webhook')
  }
}

// Load webhooks on mount
if (process.client) {
  loadWebhooks()
  
  watch(daemonError, (error) => {
    if (error) {
      showError("Connection error. The daemon may be down.")
    }
  })
}

const getStatusColor = (status: string) => {
  if (status === 'allow') return 'text-green-400 bg-green-500/10'
  if (status === 'ask') return 'text-amber-400 bg-amber-500/10'
  if (status === 'block') return 'text-red-400 bg-red-500/10'
  return 'text-gray-400 bg-gray-500/10'
}
</script>

<template>
  <div class="h-screen bg-black flex flex-col overflow-hidden">
    <AppHeader currentPage="devtools">

    </AppHeader>

    <main class="flex-1 overflow-auto px-6 py-4">
      <div class="max-w-7xl mx-auto space-y-6">
        <div class="mb-6">
          <h1 class="text-2xl font-semibold text-white mb-2">Developer Tools</h1>
          <p class="text-gray-400 text-sm">Test policies, validate templates, and manage webhooks</p>
        </div>

        <div class="grid lg:grid-cols-2 gap-6">
          <!-- Policy Testing -->
          <div class="border border-gray-500/20 rounded-lg p-6 bg-gray-500/5">
            <div class="gap-3 mb-4">
              <h2 class="text-lg font-semibold text-white">Policy</h2>
							<p class="text-gray-400 text-sm mb-4">Test policy rules without running agents</p>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-sm text-white mb-2">Agent ID</label>
                <input 
                  v-model="policyTestAgent"
                  type="text" 
                  placeholder="test-agent"
                  class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label class="block text-sm text-white mb-2">Intent</label>
                <input 
                  v-model="policyTestIntent"
                  type="text" 
                  placeholder="email.send"
                  class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label class="block text-sm text-white mb-2">Target (optional)</label>
                <input 
                  v-model="policyTestTarget"
                  type="text" 
                  placeholder="user@example.com"
                  class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div class="flex items-center gap-2">
                <input 
                  v-model="useCustomPolicy"
                  type="checkbox" 
                  id="useCustomPolicy"
                  class="rounded border-gray-500/20"
                />
                <label for="useCustomPolicy" class="text-sm text-white">Use custom policy (JSON)</label>
              </div>

              <div v-if="useCustomPolicy">
                <textarea 
                  v-model="customPolicy"
                  placeholder='{"allow": ["llm.chat:*"], "ask": ["email.send:*"], "block": ["fs.delete:*"]}'
                  rows="4"
                  class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                ></textarea>
              </div>

              <button 
                @click="testPolicy"
                :disabled="testing"
                class="w-full px-4 py-2 text-sm rounded-lg bg-blue-300 text-black font-medium hover:bg-blue-400 disabled:opacity-50 transition-colors"
              >
                {{ testing ? 'Testing...' : 'Test' }}
              </button>

              <!-- Test Result -->
              <div v-if="testResult" class="mt-4 p-4 rounded-lg bg-black/30 border border-gray-500/20">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-sm font-semibold text-white">Result</h3>
                  <span 
                    :class="getStatusColor(testResult.status)"
                    class="px-2 py-1 rounded text-xs font-mono"
                  >
                    {{ testResult.status?.toUpperCase() }}
                  </span>
                </div>
                <div class="space-y-1 text-xs">
                  <div v-if="testResult.signature" class="text-gray-400">
                    <span class="text-gray-500">Signature:</span> 
                    <span class="font-mono">{{ testResult.signature }}</span>
                  </div>
                  <div v-if="testResult.rule" class="text-gray-400">
                    <span class="text-gray-500">Matched Rule:</span> 
                    <span class="font-mono text-orange-300">{{ testResult.rule }}</span>
                  </div>
                  <div v-if="testResult.source" class="text-gray-400">
                    <span class="text-gray-500">Source:</span> 
                    <span class="font-mono">{{ testResult.source }}</span>
                  </div>
                  <div v-if="testResult.message" class="text-gray-300 mt-2 pt-2 border-t border-gray-500/20">
                    {{ testResult.message }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Template Validation -->
          <div class="border border-gray-500/20 rounded-lg p-6 bg-gray-500/5">
            <div class=" gap-3 mb-4">
              <h2 class="text-lg font-semibold text-white">Template Validation</h2>
							<p class="text-gray-400 text-sm mb-4">Validate YAML syntax before saving</p>
            </div>

            <div class="space-y-4">
              <div>
                <!-- <label class="block text-sm text-white mb-2">YAML Template</label> -->
                <textarea 
                  v-model="yamlTemplate"
                  rows="12"
                  class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                ></textarea>
              </div>

              <button 
                @click="validateTemplate"
                :disabled="validating"
                class="w-full px-4 py-2 rounded-lg text-sm bg-blue-300 text-black font-medium hover:bg-blue-400 disabled:opacity-50 transition-colors"
              >
                {{ validating ? 'Validating...' : 'Validate' }}
              </button>

              <!-- Validation Result -->
              <div v-if="validationResult" class="mt-4 p-4 rounded-lg bg-black/30 border border-gray-500/20">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-sm font-semibold text-white">Validation Result</h3>
                  <span 
                    :class="validationResult.valid ? 'text-green-300 bg-green-300/10' : 'text-red-500 bg-red-500/10'"
                    class="px-2 py-1 rounded text-xs font-mono"
                  >
                    {{ validationResult.valid ? 'VALID' : 'INVALID' }}
                  </span>
                </div>

                <div v-if="validationResult.errors.length" class="space-y-1 mb-3">
                  <div class="text-xs font-semibold text-red-500">Errors:</div>
                  <div 
                    v-for="(error, i) in validationResult.errors" 
                    :key="i"
                    class="text-xs text-red-500 pl-2"
                  >
                    • {{ error }}
                  </div>
                </div>

                <div v-if="validationResult.warnings.length" class="space-y-1">
                  <div class="text-xs font-semibold text-amber-300">Warnings:</div>
                  <div 
                    v-for="(warning, i) in validationResult.warnings" 
                    :key="i"
                    class="text-xs text-amber-300 pl-2"
                  >
                    • {{ warning }}
                  </div>
                </div>

                <div v-if="validationResult.valid && validationResult.parsed" class="mt-3 pt-3 border-t border-gray-500/20">
                  <div class="text-xs text-gray-500 mb-1">Parsed Template:</div>
                  <pre class="text-xs text-gray-300 bg-black/50 p-2 rounded overflow-x-auto">{{ JSON.stringify(validationResult.parsed, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Webhooks Management -->
        <div class="border border-gray-500/20 rounded-lg p-6 bg-gray-500/5">
          <div class="gap-3 mb-4">
            <h2 class="text-lg font-semibold text-white">Webhooks</h2>
						<p class="text-gray-400 text-sm mb-4">Notify external systems on events</p>
          </div>

          <div class="flex gap-2 mb-4">
            <input 
              v-model="newWebhookUrl"
              type="url" 
              placeholder="https://example.com/webhook"
              class="flex-1 bg-gray-500/10 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              @keyup.enter="addWebhook"
            />
            <button 
              @click="addWebhook"
              class="px-4 py-2 rounded-lg text-sm bg-blue-300 text-black font-medium hover:bg-blue-400 transition-colors"
            >
              Add
            </button>
          </div>

          <!-- Loading State -->
          <SkeletonLoader v-if="loadingWebhooks" type="card" :count="2" />

          <!-- Empty State -->
          <EmptyState
            v-else-if="!webhooks.length"
            icon="webhook"
            title="No webhooks configured"
            description="Add webhook URLs to receive real-time notifications when events occur in your system"
          />

          <div v-else class="space-y-2">
            <div 
              v-for="(webhook, i) in webhooks" 
              :key="i"
              class="flex items-center justify-between p-3 py-2 rounded-lg bg-black/30 border border-gray-500/20"
            >
              <span class="text-sm text-white font-mono break-all flex-1">{{ webhook }}</span>
              <button 
                @click="removeWebhook(webhook)"
                class="ml-3 p-1.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-400 transition-colors"
                title="Remove webhook"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

