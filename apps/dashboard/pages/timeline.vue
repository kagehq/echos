<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useDaemonApi } from '~/composables/useDaemonApi'
import { useCopy } from '~/composables/useCopy'

definePageMeta({
  ssr: false,
  middleware: 'auth'
})

useHead({
  title: 'Timeline - Echos',
  meta: [
    { name: 'description', content: 'Historical timeline of agent events and activities' }
  ]
})

// Watchdog timer for daemon API calls
const { request, daemonError } = useDaemonApi()
const { error: showError, success: showSuccess } = useToast()
const { copy, copyJSON } = useCopy()

const events = ref<any[]>([])
const connected = ref(false)
const loading = ref(false)
const filterText = ref('')
const refreshing = ref(false)
const searchQuery = ref('')
const expandedEvents = ref<Set<number>>(new Set())
const exporting = ref(false)
const showExportMenu = ref(false)

const limitCategoryLabel = (limit: any) => {
  if (!limit) return 'AI'
  if (limit?.category === 'llm') return 'LLM'
  if (limit?.category === 'total') return 'AI'
  // Legacy limits defaulted to llm-only
  return 'LLM'
}
const limitTimeframeLabel = (limit: any) => {
  const timeframe = limit?.timeframe ?? limit?.type
  return timeframe === 'daily' ? 'Daily' : 'Monthly'
}

// Export timeline in different formats
async function exportTimeline(format: 'ndjson' | 'json' | 'csv' | 'md') {
  try {
    exporting.value = true
    showExportMenu.value = false
    
    // Use watchdog timer with 10s timeout for larger exports
    const data = await request<{events: any[]}>('/timeline', { timeout: 10000 })
    if (!data) return // Request failed, error already handled
    
    const events = data.events || []
    
    let content: string
    let filename: string
    let mimeType: string
    
    switch (format) {
      case 'ndjson':
        content = events.map((e: any) => JSON.stringify(e)).join('\n') + '\n'
        filename = `echos-timeline-${Date.now()}.ndjson`
        mimeType = 'application/x-ndjson'
        break
      
      case 'json':
        content = JSON.stringify(events, null, 2)
        filename = `echos-timeline-${Date.now()}.json`
        mimeType = 'application/json'
        break
      
      case 'csv':
        // CSV export with key fields
        const headers = ['Timestamp', 'Type', 'Agent', 'Intent', 'Target', 'Status', 'Policy Rule', 'Policy Source']
        const rows = events.map((e: any) => [
          new Date(e.ts || e.event?.ts || Date.now()).toISOString(),
          e.type || '',
          e.event?.agent || e.agent || '',
          e.event?.intent || e.intent || '',
          e.event?.target || e.target || '',
          e.payload?.status || e.event?.policy?.status || '',
          e.policy?.rule || e.event?.policy?.rule || '',
          e.policy?.source || e.event?.policy?.source || ''
        ])
        content = [headers, ...rows].map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
        filename = `echos-timeline-${Date.now()}.csv`
        mimeType = 'text/csv'
        break
      
      case 'md':
        // Markdown export
        content = '# Echos Timeline Export\n\n'
        content += `Generated: ${new Date().toISOString()}\n\n`
        content += `Total Events: ${events.length}\n\n---\n\n`
        events.forEach((e: any, i: number) => {
          content += `## Event ${i + 1}\n\n`
          content += `- **Time**: ${new Date(e.ts || e.event?.ts || Date.now()).toISOString()}\n`
          content += `- **Type**: ${e.type || 'N/A'}\n`
          if (e.event?.agent) content += `- **Agent**: ${e.event.agent}\n`
          if (e.event?.intent) content += `- **Intent**: ${e.event.intent}\n`
          if (e.event?.target) content += `- **Target**: ${e.event.target}\n`
          if (e.payload?.status) content += `- **Decision**: ${e.payload.status}\n`
          if (e.policy?.rule || e.event?.policy?.rule) {
            content += `- **Policy Rule**: \`${e.policy?.rule || e.event?.policy?.rule}\`\n`
            content += `- **Policy Source**: ${e.policy?.source || e.event?.policy?.source}\n`
          }
          content += '\n---\n\n'
        })
        filename = `echos-timeline-${Date.now()}.md`
        mimeType = 'text/markdown'
        break
    }
    
    const blob = new Blob([content], { type: mimeType })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (error) {
    console.error('Failed to export timeline:', error)
    // daemonError is automatically managed by useDaemonApi
  } finally {
    exporting.value = false
  }
}

// Function to filter events - safe for SSR
function getFilteredEvents() {
  // Guard against SSR
  if (typeof window === 'undefined') return []
  if (!events.value) return []
  if (!searchQuery.value) return events.value
  
  const query = searchQuery.value.toLowerCase()
  return events.value.filter((m: any) => {
    try {
      const searchableText = [
        m?.type,
        m?.event?.intent,
        m?.event?.target,
        m?.event?.agent,
        m?.payload?.status,
        m?.action,
        m?.event?.request ? JSON.stringify(m.event.request) : '',
        m?.event?.response ? JSON.stringify(m.event.response) : ''
      ].filter(v => v).join(' ').toLowerCase()
      
      return searchableText.includes(query)
    } catch (e) {
      return false
    }
  })
}

onMounted(async ()=>{ 
  // Use watchdog timer for initial load
  const result = await request<{events: any[]}>('/timeline')
  if (result) {
    events.value = result.events || []
  }
})

async function replayLast5m(){
  loading.value = true
  filterText.value = 'Filtering last 5 minutes...'
  const end = Date.now(), start = end - 5*60*1000
  
  // Use watchdog timer with 5s timeout
  const result = await request<{events: any[]}>('/timeline/replay', { 
    method: 'POST', 
    body: { fromTs: start, toTs: end },
    timeout: 5000
  })
  
  if (result) {
    events.value = result.events || []
    filterText.value = `Showing ${events.value.length} events from last 5 min`
  } else {
    filterText.value = 'Failed to load events'
  }
  
  loading.value = false
  setTimeout(() => { filterText.value = '' }, 3000)
}

async function showAll(){
  loading.value = true
  filterText.value = 'Loading all events...'
  
  // Use watchdog timer with 10s timeout (might be large dataset)
  const result = await request<{events: any[]}>('/timeline', { timeout: 10000 })
  
  if (result) {
    events.value = result.events || []
    filterText.value = `Showing all ${events.value.length} events`
  } else {
    filterText.value = 'Failed to load events'
  }
  
  loading.value = false
  setTimeout(() => { filterText.value = '' }, 3000)
}

async function refresh(){
  refreshing.value = true
  try {
    // Add minimum delay to show "Refreshing..." feedback
    await Promise.all([
      (async () => {
        // Use watchdog timer
        const result = await request<{events: any[]}>('/timeline')
        if (result) {
          events.value = result.events || []
        }
      })(),
      new Promise(resolve => setTimeout(resolve, 500))
    ])
  } catch(e) {
    console.error('Failed to refresh:', e)
  } finally {
    refreshing.value = false
  }
}

function toggleEventDetails(index: number) {
  if (expandedEvents.value.has(index)) {
    expandedEvents.value.delete(index)
  } else {
    expandedEvents.value.add(index)
  }
}

// Watch for daemon errors and show toast (client-side only)
if (process.client) {
  watch(daemonError, (error) => {
    if (error) {
      showError("Connection error. The daemon may be down.")
    }
  });
}
</script>

<template>
  <div class="h-screen bg-black text-neutral-100 flex flex-col overflow-hidden">
    <AppHeader currentPage="timeline">
      <template #actions>
        <span v-if="filterText" class="text-xs text-gray-400 mr-2">{{ filterText }}</span>
        
        <button 
          :disabled="loading"
          class="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs hover:bg-gray-500/20 disabled:opacity-50" 
          @click="replayLast5m">
          {{ loading ? 'Loading...' : 'Last 5 min' }}
        </button>
        <button 
          :disabled="loading"
          class="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs hover:bg-gray-500/20 disabled:opacity-50" 
          @click="showAll">
          {{ loading ? 'Loading...' : 'Show All' }}
        </button>
        <span class="text-gray-500/50">|</span>
        <button 
          :disabled="refreshing"
          class="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs hover:bg-gray-500/20 disabled:opacity-50 transition-colors" 
          @click="refresh">
          {{ refreshing ? 'Refreshing...' : 'Refresh' }}
        </button>
        
        <!-- Export dropdown -->
        <div class="relative">
          <button 
            :disabled="exporting"
            class="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs hover:bg-gray-500/20 disabled:opacity-50 transition-colors flex items-center gap-2" 
            @click="showExportMenu = !showExportMenu">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {{ exporting ? 'Exporting...' : 'Export' }}
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          <!-- Dropdown menu -->
          <div v-if="showExportMenu" class="absolute right-0 mt-1 w-40 bg-black border border-gray-500/20 rounded-lg shadow-xl z-50">
            <button 
              @click="exportTimeline('json')"
              class="w-full px-4 py-2 text-left text-xs hover:bg-gray-500/10 transition-colors first:rounded-t-lg">
              <span class="font-mono">JSON</span>
              <span class="text-gray-400 block text-xs">Readable format</span>
            </button>
            <button 
              @click="exportTimeline('ndjson')"
              class="w-full px-4 py-2 text-left text-xs hover:bg-gray-500/10 transition-colors border-t border-gray-500/20">
              <span class="font-mono">NDJSON</span>
              <span class="text-gray-400 block text-xs">Line-delimited</span>
            </button>
            <button 
              @click="exportTimeline('csv')"
              class="w-full px-4 py-2 text-left text-xs hover:bg-gray-500/10 transition-colors border-t border-gray-500/20">
              <span class="font-mono">CSV</span>
              <span class="text-gray-400 block text-xs">Excel/Sheets</span>
            </button>
            <button 
              @click="exportTimeline('md')"
              class="w-full px-4 py-2 text-left text-xs hover:bg-gray-500/10 transition-colors border-t border-gray-500/20 last:rounded-b-lg">
              <span class="font-mono">Markdown</span>
              <span class="text-gray-400 block text-xs">Documentation</span>
            </button>
          </div>
        </div>
      </template>
    </AppHeader>

    <section class="flex-1 flex flex-col overflow-hidden">
      <!-- Search bar -->
      <div class="">
        <div class="relative">
          <input 
            v-model="searchQuery"
            type="text" 
            placeholder="Search agent, intent, target, request, response..."
            class="w-full bg-gray-500/5 border border-gray-500/20 border-l-0 border-r-0 border-t-0 rounded-none px-4 py-3.5 pl-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500/20 focus:bg-gray-500/10"
          />
          <svg class="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
            <span v-if="searchQuery" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
            {{ getFilteredEvents().length }} result{{ getFilteredEvents().length !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <!-- Event List -->
      <div class="flex-1 space-y-0.5 py-2 px-4 overflow-y-auto">
        <!-- Loading State -->
        <SkeletonLoader v-if="loading && !events.length" type="feed" :count="10" />
        
        <!-- Empty State -->
        <EmptyState
          v-else-if="!getFilteredEvents().length"
          :icon="searchQuery ? 'search' : 'clock'"
          :title="searchQuery ? 'No matching events' : 'Timeline is empty'"
          :description="searchQuery ? 'Try different search terms' : 'Historical events will appear here. Use the time filters above or run agents to generate activity.'"
        />
        <div class="space-y-0.5">
          <div v-for="(m,i) in getFilteredEvents()" :key="i"
            :class="[
              'rounded-lg transition-colors',
              expandedEvents.has(i) 
                ? 'border border-gray-500/20 bg-gray-500/10' 
                : 'border border-transparent hover:border-gray-500/20 hover:bg-gray-500/5'
            ]">
            <!-- Main row -->
            <div 
              class="flex items-center gap-8 py-1.5 px-2 hover:bg-gray-500/5 rounded-lg font-mono text-sm cursor-pointer"
              @click="toggleEventDetails(i)"
            >
              <!-- Time -->
              <div v-if="m.type==='event'" class="text-xs opacity-40 w-16 shrink-0 text-right">{{ new Date(m.event?.ts || m.ts).toLocaleTimeString('en-US', { hour12: false }).slice(0, 8) }}</div>
              <div v-else class="text-xs opacity-40 w-16 shrink-0 text-right">{{ new Date(m.ts || Date.now()).toLocaleTimeString('en-US', { hour12: false }).slice(0, 8) }}</div>
              
              <!-- Status Code -->
              <div v-if="m.type==='event'" class="w-12 shrink-0 text-green-300">200</div>
              <div v-else-if="m.type==='ask'" class="w-12 shrink-0 text-amber-300">ASK</div>
              <div v-else-if="m.type==='decision'" :class="m.payload?.status==='allow' ? 'text-green-300' : 'text-red-400'" class="w-12 shrink-0">{{ m.payload?.status==='allow' ? '200' : '403' }}</div>
              <div v-else-if="m.type==='token'" class="w-12 shrink-0 text-blue-300">TOK</div>
              <div v-else-if="m.type==='roleApplied'" class="w-12 shrink-0 text-purple-300">ROLE</div>
              <div v-else class="w-12 shrink-0 text-gray-400">---</div>
              
              <!-- Method/Type -->
              <div v-if="m.type==='event'" class="w-20 shrink-0 text-white">{{ m.event?.intent?.split('.')[0]?.toUpperCase() || 'EVENT' }}</div>
              <div v-else-if="m.type==='ask'" class="w-20 shrink-0 text-white">ASK</div>
              <div v-else-if="m.type==='decision'" class="w-20 shrink-0 text-white">DECIDE</div>
              <div v-else-if="m.type==='token'" class="w-20 shrink-0 text-white">{{ m.action?.toUpperCase() || 'TOKEN' }}</div>
              <div v-else-if="m.type==='roleApplied'" class="w-20 shrink-0 text-white">APPLIED</div>
              <div v-else class="w-20 shrink-0 text-white">UNKNOWN</div>
              
              <!-- Path/Target -->
              <div v-if="m.type==='event'" class="flex-1 text-gray-400">
                {{ m.event?.target || m.event?.intent || '—' }}
                <UIcon v-if="m.event?.agentSpendLimits" name="i-heroicons-currency-dollar" class="text-purple-300 ml-2" />
              </div>
              <div v-else-if="m.type==='ask'" class="flex-1 text-gray-400">{{ m.event?.target || m.event?.intent || '—' }}</div>
              <div v-else-if="m.type==='decision'" class="flex-1">
                <span :class="m.payload?.status === 'allow' ? 'text-green-300' : 'text-red-400'">
                  {{ m.payload?.status === 'allow' ? '✓ Allowed' : '✗ Denied' }}
                </span>
                <span v-if="m.payload?.token" class="text-gray-400 ml-2">- token granted</span>
              </div>
              <div v-else-if="m.type==='token'" class="flex-1 text-gray-400">{{ m.token?.slice(0, 40) }}...</div>
              <div v-else-if="m.type==='roleApplied'" class="flex-1 text-gray-400">
                {{ m.agent }} → {{ m.template }}
                <UIcon v-if="m.policy?.limits" name="i-heroicons-currency-dollar" class="text-purple-300 ml-2" />
              </div>
              <div v-else class="flex-1 text-gray-400">{{ JSON.stringify(m).slice(0, 60) }}...</div>

              <!-- Cost summary -->
              <div v-if="m.type==='event'" class="w-24 shrink-0 text-right">
                <span v-if="typeof m.event?.costUsd === 'number'" class="text-pink-300 font-mono">
                  ${{ m.event.costUsd.toFixed(4) }}
                </span>
              </div>
              <div v-else class="w-24 shrink-0"></div>
              
              <!-- Expand indicator -->
              <div class="w-4 shrink-0 text-gray-500">
                <svg v-if="expandedEvents.has(i)" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            <!-- Expanded details -->
            <div v-if="expandedEvents.has(i)" class="px-4 py-3 border-t border-gray-500/10 bg-gray-500/5">
              <div class="space-y-3 text-xs">
                <!-- Decision-specific fields -->
                <template v-if="m.type === 'decision'">
                  <div v-if="m.id" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Event ID:</span>
                    <span class="text-white font-mono">{{ m.id }}</span>
                  </div>
                  <div v-if="m.payload" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Decision:</span>
                    <span :class="m.payload.status === 'allow' ? 'text-green-300' : 'text-red-400'" class="font-mono font-bold">{{ m.payload.status?.toUpperCase() }}</span>
                  </div>
                  <div v-if="m.payload?.token" class="flex gap-2 flex-col">
                    <span class="text-gray-500">Token Granted:</span>
                    <pre class="text-green-300 font-mono bg-black/30 p-2 rounded overflow-x-auto">{{ JSON.stringify(m.payload.token, null, 2) }}</pre>
                  </div>
                  
                  <!-- Policy Decision for decision events -->
                  <div v-if="m.policy" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500 font-semibold">Original Policy Match:</span>
                    <div class="ml-4 space-y-1">
                      <div class="flex gap-2">
                        <span class="text-gray-500">Status:</span>
                        <span :class="{
                          'text-green-300': m.policy.status === 'allow',
                          'text-red-400': m.policy.status === 'block',
                          'text-yellow-300': m.policy.status === 'ask'
                        }" class="font-mono font-bold">{{ m.policy.status?.toUpperCase() }}</span>
                      </div>
                      <div v-if="m.policy.rule" class="flex gap-2">
                        <span class="text-gray-500">Matched Rule:</span>
                        <span class="text-orange-300 font-mono">{{ m.policy.rule }}</span>
                      </div>
                      <div v-if="m.policy.source" class="flex gap-2">
                        <span class="text-gray-500">Rule Source:</span>
                        <span class="text-gray-300 font-mono">{{ m.policy.source }} policy</span>
                      </div>
                      <div v-if="m.policy.limit" class="flex gap-2">
                        <span class="text-gray-500">Spend Guard:</span>
                        <span class="text-rose-300 font-mono">
                          {{ limitCategoryLabel(m.policy.limit) }}
                          {{ limitTimeframeLabel(m.policy.limit) }}
                          ${{ m.policy.limit.spent.toFixed(2) }} / ${{ m.policy.limit.value.toFixed(2) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </template>
                
                <!-- Token action-specific fields -->
                <template v-if="m.type === 'token'">
                  <div v-if="m.action" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Action:</span>
                    <span class="text-blue-300 font-mono font-bold">{{ m.action?.toUpperCase() }}</span>
                  </div>
                  <div v-if="m.token" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Token:</span>
                    <span class="text-white font-mono break-all text-xs">{{ m.token }}</span>
                  </div>
                </template>
                
                <!-- Role Applied events -->
                <template v-if="m.type === 'roleApplied'">
                  <div v-if="m.agent" class="flex gap-2">
                    <span class="text-gray-500 w-24 shrink-0">Agent:</span>
                    <span class="text-white font-mono">{{ m.agent }}</span>
                  </div>
                  <div v-if="m.template" class="flex gap-2">
                    <span class="text-gray-500 w-24 shrink-0">Template:</span>
                    <span class="text-purple-300 font-mono">{{ m.template }}</span>
                  </div>
                  <div v-if="m.policy" class="flex gap-2 flex-col mt-2">
                    <span class="text-gray-500">Policy Applied:</span>
                    <div class="grid grid-cols-3 gap-4 mt-1">
                      <div>
                        <div class="text-emerald-400/60 text-xs uppercase mb-1">Allow ({{ m.policy.allow?.length || 0 }})</div>
                        <div class="space-y-0.5">
                          <div v-for="(rule, i) in m.policy.allow?.slice(0, 3)" :key="i" class="text-emerald-400 font-mono text-xs bg-emerald-500/5 px-1.5 py-0.5 rounded">
                            {{ rule }}
                          </div>
                          <div v-if="m.policy.allow?.length > 3" class="text-gray-500 text-xs">+{{ m.policy.allow.length - 3 }} more</div>
                        </div>
                      </div>
                      <div>
                        <div class="text-amber-400/60 text-xs uppercase mb-1">Ask ({{ m.policy.ask?.length || 0 }})</div>
                        <div class="space-y-0.5">
                          <div v-for="(rule, i) in m.policy.ask?.slice(0, 3)" :key="i" class="text-amber-400 font-mono text-xs bg-amber-500/5 px-1.5 py-0.5 rounded">
                            {{ rule }}
                          </div>
                          <div v-if="m.policy.ask?.length > 3" class="text-gray-500 text-xs">+{{ m.policy.ask.length - 3 }} more</div>
                        </div>
                      </div>
                      <div>
                        <div class="text-rose-400/60 text-xs uppercase mb-1">Block ({{ m.policy.block?.length || 0 }})</div>
                        <div class="space-y-0.5">
                          <div v-for="(rule, i) in m.policy.block?.slice(0, 3)" :key="i" class="text-rose-400 font-mono text-xs bg-rose-500/5 px-1.5 py-0.5 rounded">
                            {{ rule }}
                          </div>
                          <div v-if="m.policy.block?.length > 3" class="text-gray-500 text-xs">+{{ m.policy.block.length - 3 }} more</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-if="m.overrides && (m.overrides.allow?.length || m.overrides.ask?.length || m.overrides.block?.length)" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500">Overrides Applied:</span>
                    <pre class="text-gray-300 font-mono bg-black/30 p-2 rounded overflow-x-auto text-xs">{{ JSON.stringify(m.overrides, null, 2) }}</pre>
                  </div>
                  
                  <!-- Spend Limits -->
                  <div v-if="m.policy?.limits" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500 font-semibold">Spend Limits:</span>
                    <div class="ml-4 space-y-1">
                      <div v-if="m.policy.limits.ai_daily_usd" class="flex gap-2">
                        <span class="text-gray-500">Daily AI:</span>
                        <span class="text-purple-300 font-mono">${{ m.policy.limits.ai_daily_usd.toFixed(2) }}</span>
                      </div>
                      <div v-if="m.policy.limits.llm_daily_usd" class="flex gap-2">
                        <span class="text-gray-500">Daily LLM:</span>
                        <span class="text-purple-300 font-mono">${{ m.policy.limits.llm_daily_usd.toFixed(2) }}</span>
                      </div>
                      <div v-if="m.policy.limits.ai_monthly_usd" class="flex gap-2">
                        <span class="text-gray-500">Monthly AI:</span>
                        <span class="text-purple-300 font-mono">${{ m.policy.limits.ai_monthly_usd.toFixed(2) }}</span>
                      </div>
                      <div v-if="m.policy.limits.llm_monthly_usd" class="flex gap-2">
                        <span class="text-gray-500">Monthly LLM:</span>
                        <span class="text-purple-300 font-mono">${{ m.policy.limits.llm_monthly_usd.toFixed(2) }}</span>
                      </div>
                    </div>
                  </div>
                </template>
                
                <!-- Event-specific fields (for type: "event" or type: "ask") -->
                <template v-if="m.type === 'event' || m.type === 'ask'">
                  <!-- Agent info -->
                  <div v-if="m.event?.agent" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Agent:</span>
                    <span class="text-white font-mono">{{ m.event.agent }}</span>
                  </div>
                  
                  <!-- Intent -->
                  <div v-if="m.event?.intent" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Intent:</span>
                    <span class="text-white font-mono">{{ m.event.intent }}</span>
                  </div>
                  
                  <!-- Target -->
                  <div v-if="m.event?.target" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Target:</span>
                    <span class="text-white font-mono break-all">{{ m.event.target }}</span>
                  </div>

                  <!-- Cost -->
                  <div v-if="typeof m.event?.costUsd === 'number'" class="flex gap-2 items-center">
                    <span class="text-gray-500 w-20 shrink-0">Cost:</span>
                    <span class="text-pink-300 font-mono">${{ m.event.costUsd.toFixed(4) }}</span>
                  </div>

                  <!-- Business Context -->
                  <div v-if="m.event?.customerId" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Customer:</span>
                    <span class="text-blue-300 font-mono">{{ m.event.customerId }}</span>
                  </div>
                  
                  <div v-if="m.event?.subscriptionId" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Subscription:</span>
                    <span class="text-blue-300 font-mono">{{ m.event.subscriptionId }}</span>
                  </div>
                  
                  <div v-if="m.event?.feature" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Feature:</span>
                    <span class="text-green-300 font-mono">{{ m.event.feature }}</span>
                  </div>
                  
                  <div v-if="m.event?.environment" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Environment:</span>
                    <span class="text-yellow-300 font-mono">{{ m.event.environment }}</span>
                  </div>

                  <!-- Performance Metrics -->
                  <div v-if="m.event?.duration" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Duration:</span>
                    <span class="text-purple-300 font-mono">{{ m.event.duration }}ms</span>
                  </div>
                  
                  <div v-if="m.event?.tokensUsed" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Tokens:</span>
                    <span class="text-purple-300 font-mono">{{ m.event.tokensUsed.toLocaleString() }}</span>
                  </div>
                  
                  <div v-if="m.event?.modelVersion" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Model:</span>
                    <span class="text-purple-300 font-mono">{{ m.event.modelVersion }}</span>
                  </div>

                  <!-- Audit Trail -->
                  <div v-if="m.event?.ipAddress" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">IP:</span>
                    <span class="text-gray-300 font-mono">{{ m.event.ipAddress }}</span>
                  </div>
                  
                  <div v-if="m.event?.correlationId" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Correlation:</span>
                    <span class="text-gray-300 font-mono">{{ m.event.correlationId }}</span>
                  </div>
                  
                  <!-- Request -->
                  <div v-if="m.event?.request" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Request:</span>
                    <pre class="text-sky-300 font-mono w-full bg-gray-500/5 border border-gray-500/10 p-2 rounded-lg overflow-x-auto">{{ JSON.stringify(m.event.request, null, 2) }}</pre>
                  </div>
                  
                  <!-- Response -->
                  <div v-if="m.event?.response" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Response:</span>
                    <pre class="text-green-300 font-mono w-full bg-gray-500/5 border border-gray-500/10 p-2 rounded-lg overflow-x-auto">{{ JSON.stringify(m.event.response, null, 2) }}</pre>
                  </div>
                  
                  <!-- Metadata -->
                  <div v-if="m.event?.metadata" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Metadata:</span>
                    <pre class="text-purple-300 font-mono w-full bg-gray-500/5 border border-gray-500/10 p-2 rounded-lg overflow-x-auto">{{ JSON.stringify(m.event.metadata, null, 2) }}</pre>
                  </div>
                  
                  <!-- Policy Decision -->
                  <div v-if="m.event?.policy" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500 font-semibold">Policy Decision:</span>
                    <div class="ml-4 space-y-1">
                      <div class="flex gap-2">
                        <span class="text-gray-500">Status:</span>
                        <span :class="{
                          'text-green-300': m.event.policy.status === 'allow',
                          'text-red-400': m.event.policy.status === 'block',
                          'text-yellow-300': m.event.policy.status === 'ask'
                        }" class="font-mono font-bold">{{ m.event.policy.status?.toUpperCase() }}</span>
                      </div>
                      <div v-if="m.event.policy.byToken" class="flex gap-2">
                        <span class="text-gray-500">Method:</span>
                        <span class="text-blue-300 font-mono">Authorized by token</span>
                      </div>
                      <div v-else-if="m.event.policy.rule" class="flex gap-2">
                        <span class="text-gray-500">Matched Rule:</span>
                        <span class="text-orange-300 font-mono">{{ m.event.policy.rule }}</span>
                      </div>
                      <div v-if="m.event.policy.source && !m.event.policy.byToken" class="flex gap-2">
                        <span class="text-gray-500">Rule Source:</span>
                        <span class="text-gray-300 font-mono">{{ m.event.policy.source }} policy</span>
                      </div>
                      <div v-if="m.event.policy.limit" class="flex gap-2">
                        <span class="text-gray-500">Spend Guard:</span>
                        <span class="text-rose-300 font-mono">
                          {{ limitCategoryLabel(m.event.policy.limit) }}
                          {{ limitTimeframeLabel(m.event.policy.limit) }}
                          ${{ m.event.policy.limit.spent.toFixed(2) }} / ${{ m.event.policy.limit.value.toFixed(2) }}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Agent Spend Limits -->
                  <div v-if="m.event?.agentSpendLimits" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500 font-semibold">Agent Spend Limits:</span>
                    <div class="ml-4 space-y-1">
                      <div v-if="m.event.agentSpendLimits.ai_daily_usd" class="flex gap-2">
                        <span class="text-gray-500">Daily AI:</span>
                        <span class="text-purple-300 font-mono">${{ m.event.agentSpendLimits.ai_daily_usd.toFixed(2) }}</span>
                      </div>
                      <div v-if="m.event.agentSpendLimits.llm_daily_usd" class="flex gap-2">
                        <span class="text-gray-500">Daily LLM:</span>
                        <span class="text-purple-300 font-mono">${{ m.event.agentSpendLimits.llm_daily_usd.toFixed(2) }}</span>
                      </div>
                      <div v-if="m.event.agentSpendLimits.ai_monthly_usd" class="flex gap-2">
                        <span class="text-gray-500">Monthly AI:</span>
                        <span class="text-purple-300 font-mono">${{ m.event.agentSpendLimits.ai_monthly_usd.toFixed(2) }}</span>
                      </div>
                      <div v-if="m.event.agentSpendLimits.llm_monthly_usd" class="flex gap-2">
                        <span class="text-gray-500">Monthly LLM:</span>
                        <span class="text-purple-300 font-mono">${{ m.event.agentSpendLimits.llm_monthly_usd.toFixed(2) }}</span>
                      </div>
                    </div>
                  </div>
                </template>
                
                <!-- Full timestamp (for all types) -->
                <div class="flex gap-2">
                  <span class="text-gray-500 w-20 shrink-0">Timestamp:</span>
                  <span class="text-gray-400">{{ new Date(m.event?.ts || m.ts || Date.now()).toLocaleString() }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

