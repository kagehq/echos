<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useDaemonApi } from '~/composables/useDaemonApi'
import { useToast } from '~/composables/useToast'
import { useCopy } from '~/composables/useCopy'

definePageMeta({
  ssr: false
})

useHead({
  title: 'Roles & Templates - Echos',
  meta: [
    { name: 'description', content: 'Manage agent roles and policy templates' }
  ]
})

const { request, daemonError } = useDaemonApi()
const { error: showError, success: showSuccess } = useToast()
const { copy, copyJSON } = useCopy()

const templates = ref<any[]>([])
const roles = ref<any[]>([])
const agentId = ref<string>('example_agent')
const selectedTemplate = ref<string>('')
const resolved = ref<any|null>(null)
const overrides = ref<{allow:string;ask:string;block:string}>({allow:'',ask:'',block:''})
const applying = ref(false)
const loading = ref(false)

async function loadTemplates(){
  loading.value = true
  const r = await request<{templates: any[]}>('/templates')
  if (r) {
    templates.value = r.templates || []
    if (!selectedTemplate.value && templates.value.length) {
      selectedTemplate.value = templates.value[0].id
    }
  }
  loading.value = false
}

async function loadRoles(){
  const r = await request<{roles: any[]}>('/roles')
  if (r) {
    roles.value = r.roles || []
  }
}

async function applyRole(){
  if (!agentId.value.trim()) {
    showError('Agent ID is required')
    return
  }
  
  applying.value = true
  
  const ov:any = {}
  if (overrides.value.allow.trim()) ov.allow = overrides.value.allow.split(',').map(s=>s.trim())
  if (overrides.value.ask.trim())   ov.ask   = overrides.value.ask.split(',').map(s=>s.trim())
  if (overrides.value.block.trim()) ov.block = overrides.value.block.split(',').map(s=>s.trim())
  
  const result = await request<{ok: boolean; policy?: any; error?: string}>('/roles/apply', { 
    method:'POST', 
    body: { agentId: agentId.value, template: selectedTemplate.value, overrides: ov } 
  })
  
  if (result?.ok) {
    showSuccess(`Role "${selectedTemplate.value}" applied to ${agentId.value}`)
    await viewResolved()
    await loadRoles()
    // Clear overrides after successful application
    overrides.value = {allow:'',ask:'',block:''}
  } else if (result?.error) {
    showError(result.error)
  }
  
  applying.value = false
}

async function viewResolved(){
  const r = await request<any>(`/roles/${encodeURIComponent(agentId.value)}`)
  if (r) {
    resolved.value = r
  }
}

async function refresh() {
  await Promise.all([loadTemplates(), loadRoles(), viewResolved()])
}

const selectedTemplateDetails = computed(() => {
  return templates.value.find(t => t.id === selectedTemplate.value)
})

onMounted(async ()=>{
  await refresh()
})

// Watch for daemon errors and show toast (client-side only)
if (process.client) {
  watch(daemonError, (error) => {
    if (error) {
      showError("Connection error. The daemon may be down.")
    }
  })
}
</script>

<template>
  <div class="h-screen bg-black flex flex-col overflow-hidden">
    <AppHeader currentPage="roles">
      <template #actions>
        <button 
          :disabled="loading"
          class="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs hover:bg-gray-500/20 disabled:opacity-50 transition-colors" 
          @click="refresh">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </template>
    </AppHeader>

    <main class="flex-1 overflow-auto px-6 py-4">
      <div class="max-w-7xl mx-auto">
        <div class="mb-6">
          <h1 class="text-2xl font-semibold text-white mb-2">Roles & Templates</h1>
          <p class="text-gray-400 text-sm">Apply policy templates to agents with optional overrides</p>
        </div>

        <div class="grid lg:grid-cols-3 gap-6">
          <!-- Apply Template Form -->
          <div class="lg:col-span-1 space-y-6">
            <div class="border border-gray-500/20 rounded-lg p-4 bg-gray-500/5">
              <h2 class="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wide">Template</h2>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-sm text-white mb-2">Agent ID</label>
                  <input 
                    v-model="agentId" 
                    class="w-full bg-gray-500/5 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-600" 
                    placeholder="e.g. sales_bot" 
                  />
                </div>

                <div>
                  <label class="block text-sm text-white mb-2">Template</label>
                  <select 
                    v-model="selectedTemplate" 
                    class="w-full bg-gray-500/5 border border-gray-500/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-600">
                    <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
                  </select>
                </div>

                <!-- Template Preview -->
                <div v-if="selectedTemplateDetails" class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-3">
                  <p class="text-xs text-gray-500 uppercase mb-2">Template Preview</p>
                  <p class="text-xs text-gray-400 mb-3">{{ selectedTemplateDetails.description }}</p>
                  <div class="space-y-2 text-xs">
                    <div>
                      <span class="text-emerald-400">Allow:</span> 
                      <span class="text-gray-500 ml-1">{{ selectedTemplateDetails.allow.length }} rules</span>
                    </div>
                    <div>
                      <span class="text-amber-400">Ask:</span> 
                      <span class="text-gray-500 ml-1">{{ selectedTemplateDetails.ask.length }} rules</span>
                    </div>
                    <div>
                      <span class="text-rose-400">Block:</span> 
                      <span class="text-gray-500 ml-1">{{ selectedTemplateDetails.block.length }} rules</span>
                    </div>
                  </div>
                </div>

                <!-- Overrides -->
                <details class="border border-gray-500/20 bg-gray-500/5 rounded-lg">
                  <summary class="cursor-pointer px-3 py-2 text-sm text-gray-400 hover:text-gray-300">
                    Advanced: Overrides (comma-separated)
                  </summary>
                  <div class="px-3 pb-3 space-y-3 mt-2">
                    <div>
                      <label class="text-xs text-green-300/80 block mb-1">Allow</label>
                      <input 
                        v-model="overrides.allow" 
                        class="w-full bg-gray-500/5 border border-gray-500/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-gray-700" 
                        placeholder="e.g. calendar.read:*"
                      />
                    </div>
                    <div>
                      <label class="text-xs text-amber-300/80 block mb-1">Ask</label>
                      <input 
                        v-model="overrides.ask" 
                        class="w-full bg-gray-500/5 border border-gray-500/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-gray-700" 
                        placeholder="e.g. email.send:*@company.com"
                      />
                    </div>
                    <div>
                      <label class="text-xs text-red-500/80 block mb-1">Block</label>
                      <input 
                        v-model="overrides.block" 
                        class="w-full bg-gray-500/5 border border-gray-500/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-gray-700" 
                        placeholder="e.g. fs.delete:*"
                      />
                    </div>
                  </div>
                </details>

                <button 
                  class="w-full px-4 py-2 rounded-lg bg-blue-300 hover:bg-blue-400 text-black text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                  @click="applyRole"
                  :disabled="applying || !agentId.trim() || !selectedTemplate">
                  {{ applying ? 'Applying...' : 'Apply' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Resolved Policy & Active Roles -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Resolved Policy -->
            <div class="border border-gray-500/20 rounded-lg p-4 bg-gray-500/5">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Resolved Policy
                  <span v-if="resolved?.template" class="text-xs text-gray-500 font-normal ml-2">
                    ({{ resolved.template }})
                  </span>
                </h2>
                <button 
                  class="px-3 py-1.5 rounded-lg bg-gray-500/5 border border-gray-500/10 hover:bg-gray-500/10 text-xs text-gray-300 transition-colors" 
                  @click="viewResolved">
                  Refresh
                </button>
              </div>
              
              <div v-if="!resolved || (!resolved.allow.length && !resolved.ask.length && !resolved.block.length)" class="text-sm text-gray-500 py-8 text-center">
                No policy applied for agent <span class="font-mono text-gray-400">{{ agentId }}</span>
              </div>
              <div v-else class="grid md:grid-cols-3 gap-4">
                <div>
                  <div class="text-xs text-green-300 uppercase tracking-wide mb-2">Allow</div>
                  <div class="space-y-1">
                    <div v-for="(rule, i) in resolved.allow" :key="i" class="font-mono text-xs text-green-300 bg-green-500/5 px-2 py-1 rounded break-all">
                      {{ rule }}
                    </div>
                    <div v-if="!resolved.allow.length" class="text-xs text-gray-600">None</div>
                  </div>
                </div>
                <div>
                  <div class="text-xs text-amber-300 uppercase tracking-wide mb-2">Ask</div>
                  <div class="space-y-1">
                    <div v-for="(rule, i) in resolved.ask" :key="i" class="font-mono text-xs text-amber-300 bg-amber-500/5 px-2 py-1 rounded break-all">
                      {{ rule }}
                    </div>
                    <div v-if="!resolved.ask.length" class="text-xs text-gray-600">None</div>
                  </div>
                </div>
                <div>
                  <div class="text-xs text-red-500 uppercase tracking-wide mb-2">Block</div>
                  <div class="space-y-1">
                    <div v-for="(rule, i) in resolved.block" :key="i" class="font-mono text-xs text-red-500 bg-red-500/5 px-2 py-1 rounded break-all">
                      {{ rule }}
                    </div>
                    <div v-if="!resolved.block.length" class="text-xs text-gray-600">None</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Active Roles -->
            <div class="border border-gray-500/20 rounded-lg p-4 bg-gray-500/5">
              <h2 class="text-xs font-medium text-gray-500 mb-4 uppercase tracking-wide">Role Assignments</h2>
              
              <!-- Loading State -->
              <SkeletonLoader v-if="loading && !roles.length" type="card" :count="2" />
              
              <!-- Empty State -->
              <EmptyState
                v-else-if="!roles.length"
                icon="inbox"
                title="No roles assigned"
                description="Apply a template to an agent to get started. Roles define what actions agents can perform."
              />
              <div v-else class="space-y-2">
                <div 
                  v-for="role in roles" 
                  :key="role.agentId"
                  class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-3 hover:border-gray-500/20 hover:bg-gray-500/10 transition-colors cursor-pointer"
                  @click="agentId = role.agentId; viewResolved()">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-mono text-sm text-white">{{ role.agentId }}</span>
                    <span class="text-xs text-blue-300 bg-blue-300/10 px-3 py-1 rounded-lg">{{ role.template }}</span>
                  </div>
                  <div class="flex gap-4 text-xs">
                    <div class="flex items-center gap-1">
                      <span class="text-green-300">✓</span>
                      <span class="text-gray-500">{{ role.policy.allow.length }} allow</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <span class="text-amber-300">?</span>
                      <span class="text-gray-500">{{ role.policy.ask.length }} ask</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <span class="text-red-500">✗</span>
                      <span class="text-gray-500">{{ role.policy.block.length }} block</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

