<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDaemonApi } from '~/composables/useDaemonApi'
import { useCopy } from '~/composables/useCopy'

definePageMeta({
  ssr: false,
  middleware: 'auth'
})

useHead({
  title: 'Feed - Echos',
  meta: [
    { name: 'description', content: 'Live feed of agent activities and permission requests' }
  ]
})

// Watchdog timer for daemon API calls
const { request, daemonError } = useDaemonApi()
const { copy, copyJSON } = useCopy()
const { error: showError, success: showSuccess } = useToast()

const feed = ref<any[]>([])
const ask = ref<any|null>(null)
const tokens = ref<any[]>([])
const connected = ref(false)
const modalLoading = ref(false)
const timeoutId = ref<number|null>(null)
const sidebarOpen = ref(true)
const refreshing = ref(false)
const searchQuery = ref('')
const expandedEvents = ref<Set<number>>(new Set())
const exporting = ref(false)
const showExportMenu = ref(false)

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

// WebSocket reference - will be initialized in onMounted
let $ws: any = null

// Function to filter feed - safe for SSR
function getFilteredFeed() {
  // Guard against SSR
  if (typeof window === 'undefined') return []
  if (!feed.value) return []
  if (!searchQuery.value) return feed.value
  
  const query = searchQuery.value.toLowerCase()
  return feed.value.filter((m: any) => {
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

// Persist sidebar state to localStorage (client-side only)
if (process.client) {
  watch(sidebarOpen, (newValue) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('echos-sidebar-open', JSON.stringify(newValue))
    }
  })

  // Auto-timeout consent modal after 2 minutes
  watch(ask, (newAsk) => {
    if (timeoutId.value) clearTimeout(timeoutId.value)
    if (newAsk) {
      timeoutId.value = window.setTimeout(() => {
        showError("⏱️ Request timed out. The agent may have moved on.")
        ask.value = null
      }, 120000) // 2 minutes
    }
  })

  // Watch for daemon errors and show toast
  watch(daemonError, (error) => {
    if (error) {
      showError("Connection error. The daemon may be down.")
    }
  })
}

onMounted(async () => {
  // Initialize WebSocket access from Nuxt app
  try {
    $ws = useNuxtApp().$ws
  } catch (e) {
    console.warn('WebSocket plugin not available:', e)
  }
  
  // Restore sidebar state from localStorage
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('echos-sidebar-open')
    if (saved !== null) {
      sidebarOpen.value = JSON.parse(saved)
    }
  }

  // Only set up WebSocket monitoring if available
  if ($ws) {
    // Check connection state periodically and auto-refresh on reconnect
    let previousState = $ws?.readyState
    const checkConnection = async () => {
      if (!$ws) return // Guard against undefined WebSocket
      
      const currentState = $ws.readyState
      const isConnected = currentState === WebSocket.OPEN
      const wasDisconnected = previousState !== WebSocket.OPEN
      
      if (connected.value !== isConnected) {
        connected.value = isConnected
        
        if (isConnected && wasDisconnected && previousState !== null) {
          // Reconnected - refresh data with watchdog timer
          try {
            await refreshTokens()
            const eventsRes = await request<{events: any[]}>('/timeline')
            if (eventsRes?.events) {
              feed.value = eventsRes.events.slice(0, 50)
            }
          } catch (e) {
            console.error('Failed to refresh data:', e)
          }
        }
      }
      
      previousState = currentState
    }
    
    // Check immediately and then every second
    checkConnection()
    const connectionInterval = setInterval(checkConnection, 1000)
    
    // Cleanup on unmount
    onBeforeUnmount(() => {
      clearInterval(connectionInterval)
    })

    // Set up WebSocket message listener
    $ws.addEventListener("message", (e: MessageEvent) => {
      const msg = JSON.parse(e.data)
      feed.value.unshift(msg)
      if (msg.type === "ask") { ask.value = msg.event }
      if (msg.type === "token") refreshTokens()
    })
  }
  
  // Load initial tokens with watchdog timer
  await refreshTokens()
  
  // Fetch initial timeline/events with watchdog timer
  const eventsRes = await request<{events: any[]}>('/timeline')
  if (eventsRes?.events) {
    feed.value = eventsRes.events.slice(0, 50)
  }
})

async function refreshTokens(){
  // Use watchdog timer (5s timeout)
  const result = await request<{tokens: any[]}>('/tokens/list')
  if (result) {
    tokens.value = result.tokens || []
  }
  // daemonError automatically managed
}
function humanIntent(e:any){
  if (e.intent==='calendar.read') return `read your calendar`
  if (e.intent==='email.send') return `send an email`
  if (e.intent==='slack.post') return `post to Slack`
  if (e.intent==='http.request') return `perform a web request to ${e.target}`
  if (e.intent==='llm.chat') return `chat with the LLM`
  return `${e.intent} ${e.target??""}`.trim()
}

async function deny(){ 
  if(!ask.value) return; 
  modalLoading.value = true
  try {
    // Use watchdog timer with 3s timeout for user actions
    const result = await request(`/decide/${ask.value.id}`, { 
      method: 'POST', 
      body: { status: 'block' },
      timeout: 3000
    })
    if (result) {
      if (timeoutId.value) clearTimeout(timeoutId.value)
      ask.value = null
      showSuccess('Permission denied')
    } else {
      showError("Failed to send decision. Please try again.")
    }
  } catch(e) {
    showError("Failed to send decision. Please try again.")
  } finally {
    modalLoading.value = false
  }
}

async function allowOnce(){ 
  if(!ask.value) return; 
  modalLoading.value = true
  try {
    // Use watchdog timer with 3s timeout for user actions
    const result = await request(`/decide/${ask.value.id}`, { 
      method: 'POST', 
      body: { status: 'allow' },
      timeout: 3000
    })
    if (result) {
      if (timeoutId.value) clearTimeout(timeoutId.value)
      ask.value = null
      showSuccess('Permission granted for this request')
    } else {
      showError("Failed to send decision. Please try again.")
    }
  } catch(e) {
    showError("Failed to send decision. Please try again.")
  } finally {
    modalLoading.value = false
  }
}

async function allowFor(durationSec:number, scopes:string[]){ 
  if(!ask.value) return;
  modalLoading.value = true
  try {
    // Use watchdog timer with 3s timeout for user actions
    const result = await request(`/decide/${ask.value.id}`, { 
      method: 'POST', 
      body: { status: 'allow', agent: ask.value.agent, grant: { scopes, durationSec, reason: 'user approved' } },
      timeout: 3000
    })
    if (result) {
      if (timeoutId.value) clearTimeout(timeoutId.value)
      ask.value = null
      await refreshTokens()
      showSuccess(`Token granted for ${durationSec/3600}h`)
    } else {
      showError("Failed to grant token. Please try again.")
    }
  } catch(e) {
    showError("Failed to grant token. Please try again.")
  } finally {
    modalLoading.value = false
  }
}
async function refresh() {
  refreshing.value = true
  try {
    // Add minimum delay to show "Refreshing..." feedback
    await Promise.all([
      (async () => {
        // Reload feed data with watchdog timer
        const eventsRes = await request<{events: any[]}>('/timeline')
        if (eventsRes?.events) {
          feed.value = eventsRes.events.slice(0, 50)
        }
        // Reload tokens (also with watchdog timer)
        await refreshTokens()
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

async function revoke(t:any){ 
  await request('/tokens/revoke', { method: 'POST', body: { token: t.token }, timeout: 3000 })
  await refreshTokens() 
}
async function pause(t:any){ 
  await request('/tokens/pause', { method: 'POST', body: { token: t.token }, timeout: 3000 })
  await refreshTokens() 
}
async function resume(t:any){
  await request('/tokens/resume', { method: 'POST', body: { token: t.token }, timeout: 3000 })
  await refreshTokens() 
}
</script>

<template>
  <div class="h-screen bg-black flex flex-col overflow-hidden">
    <AppHeader currentPage="feed">
      <template #actions>
        <div class="flex items-center gap-2">
          <span :class="['inline-block w-2 h-2 rounded-full', connected ? 'bg-green-300' : 'bg-red-500']"></span>
          <span class="text-gray-400 text-xs">
            {{ connected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
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

    <section class="flex-1 flex overflow-hidden relative">
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Search bar -->
        <div class="">
          <div class="relative">
            <input 
              v-model="searchQuery"
              type="text" 
              placeholder="Search agent, intent, target, request, response..."
              class="w-full bg-gray-500/5 border border-r-0 border-l-0 border-t-0 border-gray-500/20 rounded-none px-4 py-3.5 pl-14 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-500/20 focus:bg-gray-500/10"
            />
            <svg class="w-4 h-4 text-gray-500 absolute left-5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span v-if="searchQuery" class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              {{ getFilteredFeed().length }} result{{ getFilteredFeed().length !== 1 ? 's' : '' }}
            </span>
          </div>
        </div>

        <!-- Feed list -->
        <div class="flex-1 space-y-0.5 py-2 px-4 overflow-y-auto">
          <!-- Loading State -->
          <SkeletonLoader v-if="refreshing && !feed.length" type="feed" :count="8" />
          
          <!-- Empty State -->
          <EmptyState
            v-else-if="!getFilteredFeed().length"
            :icon="searchQuery ? 'search' : 'clock'"
            :title="searchQuery ? 'No matching events' : 'No events yet'"
            :description="searchQuery ? 'Try adjusting your search terms' : 'Events will appear here as agents perform actions.'"
          >
            <div v-if="!searchQuery" class="mt-4 text-sm text-gray-400 bg-gray-500/5 border border-gray-500/20 rounded-lg p-4 max-w-lg space-y-3">
              <div>
                <p class="font-semibold text-white mb-2">🚀 Getting Started</p>
                <ol class="space-y-2 text-xs">
                  <li class="flex gap-2">
                    <span class="text-gray-500 shrink-0">1.</span>
                    <span>Create an API key in <a href="/settings" class="text-blue-300 hover:underline">Settings</a></span>
                  </li>
                  <li class="flex gap-2">
                    <span class="text-gray-500 shrink-0">2.</span>
                    <span>Assign a policy template to your agent in <a href="/roles" class="text-blue-300 hover:underline">Roles & Templates</a></span>
                  </li>
                  <li class="flex gap-2">
                    <span class="text-gray-500 shrink-0">3.</span>
                    <span>Integrate Echos SDK into your AI agent:</span>
                  </li>
                </ol>
              </div>
              <pre class="text-xs bg-black/50 border border-gray-500/20 rounded p-2 overflow-x-auto"><code class="text-green-300">npm install @echoshq/sdk

<span class="text-gray-400">// In your agent code:</span>
<span class="text-blue-300">import</span> { EchosClient } <span class="text-blue-300">from</span> <span class="text-amber-300">'@echoshq/sdk'</span>

<span class="text-blue-300">const</span> echos = <span class="text-blue-300">new</span> EchosClient({
  apiKey: process.env.ECHOS_API_KEY
})

<span class="text-gray-400">// Before sensitive actions:</span>
<span class="text-blue-300">const</span> decision = <span class="text-blue-300">await</span> echos.decide({
  agent: <span class="text-amber-300">'my_agent'</span>,
  intent: <span class="text-amber-300">'email.send'</span>,
  target: <span class="text-amber-300">'user@example.com'</span>
})

<span class="text-blue-300">if</span> (decision.status === <span class="text-amber-300">'allow'</span>) {
  <span class="text-gray-400">// Perform the action</span>
}</code></pre>
              <p class="text-xs text-gray-500">
                📚 <a href="https://github.com/kagehq/echos" target="_blank" class="text-blue-300 hover:underline">View full documentation</a>
              </p>
            </div>
          </EmptyState>
          <div v-for="(m,i) in getFilteredFeed()" :key="i" 
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
              <div v-if="m.type==='event'" class="text-xs text-gray-500 w-16 shrink-0 text-right">{{ new Date(m.event.ts).toLocaleTimeString('en-US', { hour12: false }).slice(0, 8) }}</div>
              <div v-else class="text-xs text-gray-500 w-16 shrink-0 text-right">{{ new Date(m.ts || Date.now()).toLocaleTimeString('en-US', { hour12: false }).slice(0, 8) }}</div>
              
              <!-- Status Code -->
              <div v-if="m.type==='event'" class="w-12 shrink-0 text-green-300">200</div>
              <div v-else-if="m.type==='ask'" class="w-12 shrink-0 text-amber-300">ASK</div>
              <div v-else-if="m.type==='decision'" :class="m.payload?.status==='allow' ? 'text-green-300' : 'text-red-400'" class="w-12 shrink-0">{{ m.payload?.status==='allow' ? '200' : '403' }}</div>
              <div v-else-if="m.type==='token'" class="w-12 shrink-0 text-blue-300">TOK</div>
              <div v-else-if="m.type==='roleApplied'" class="w-12 shrink-0 text-purple-300">ROLE</div>
              
              <!-- Method/Type -->
              <div v-if="m.type==='event'" class="w-20 shrink-0 text-white">{{ m.event.intent?.split('.')[0]?.toUpperCase() || 'EVENT' }}</div>
              <div v-else-if="m.type==='ask'" class="w-20 shrink-0 text-white">ASK</div>
              <div v-else-if="m.type==='decision'" class="w-20 shrink-0 text-white">DECIDE</div>
              <div v-else-if="m.type==='token'" class="w-20 shrink-0 text-white">{{ m.action?.toUpperCase() || 'TOKEN' }}</div>
              <div v-else-if="m.type==='roleApplied'" class="w-20 shrink-0 text-white">APPLIED</div>
              
              <!-- Path/Target -->
              <div v-if="m.type==='event'" class="flex-1 text-gray-400">
                {{ m.event.target || m.event.intent }}
                <UIcon v-if="m.event?.agentSpendLimits" name="i-heroicons-currency-dollar" class="text-purple-300 ml-2" />
              </div>
              <div v-else-if="m.type==='ask'" class="flex-1 text-gray-400">{{ m.event.target || m.event.intent }}</div>
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
                  <div v-if="m.id" class="flex gap-2 items-center">
                    <span class="text-gray-500 w-20 shrink-0">Event ID:</span>
                    <span class="text-white font-mono flex-1">{{ m.id }}</span>
                    <button 
                      @click="copy(m.id, 'Event ID')"
                      class="shrink-0 p-1 rounded hover:bg-gray-500/10 text-gray-400 hover:text-white transition-colors"
                      title="Copy event ID"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <div v-if="m.payload" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Decision:</span>
                    <span :class="m.payload.status === 'allow' ? 'text-green-300' : 'text-red-400'" class="font-mono font-bold">{{ m.payload.status?.toUpperCase() }}</span>
                  </div>
                  <div v-if="m.payload?.token" class="flex gap-2 flex-col">
                    <div class="flex items-center justify-between">
                      <span class="text-gray-500">Token Granted:</span>
                      <button 
                        @click="copyJSON(m.payload.token, 'Token')"
                        class="p-1 rounded hover:bg-gray-500/10 text-gray-400 hover:text-white transition-colors"
                        title="Copy token JSON"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
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
                    </div>
                  </div>
                </template>
                
                <!-- Token action-specific fields -->
                <template v-if="m.type === 'token'">
                  <div v-if="m.action" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Action:</span>
                    <span class="text-blue-300 font-mono font-bold">{{ m.action?.toUpperCase() }}</span>
                  </div>
                  <div v-if="m.token" class="flex gap-2 items-start">
                    <span class="text-gray-500 w-20 shrink-0">Token:</span>
                    <span class="text-white font-mono break-all text-xs flex-1">{{ m.token }}</span>
                    <button 
                      @click="copy(m.token, 'Token')"
                      class="shrink-0 p-1 rounded hover:bg-gray-500/10 text-gray-400 hover:text-white transition-colors"
                      title="Copy token"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
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
                  
                  <!-- Preview -->
                  <div v-if="m.event?.preview" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Preview:</span>
                    <span class="text-gray-400 italic">{{ m.event.preview }}</span>
                  </div>
                  
                  <!-- Token Attached -->
                  <div v-if="m.event?.tokenAttached" class="flex gap-2">
                    <span class="text-gray-500 w-20 shrink-0">Token:</span>
                    <span class="text-blue-300">✓ Token attached</span>
                  </div>
                  
                  <!-- Request -->
                  <div v-if="m.event?.request" class="flex gap-2 flex-col">
                    <div class="flex items-center justify-between">
                      <span class="text-gray-500 w-20 shrink-0">Request:</span>
                      <button 
                        @click="copyJSON(m.event.request, 'Request')"
                        class="p-1 rounded hover:bg-gray-500/10 text-gray-400 hover:text-white transition-colors"
                        title="Copy request JSON"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <pre class="text-sky-300 font-mono w-full bg-gray-500/5 border border-gray-500/10 p-2 rounded-lg overflow-x-auto">{{ JSON.stringify(m.event.request, null, 2) }}</pre>
                  </div>
                  
                  <!-- Response -->
                  <div v-if="m.event?.response" class="flex gap-2 flex-col">
                    <div class="flex items-center justify-between">
                      <span class="text-gray-500 w-20 shrink-0">Response:</span>
                      <button 
                        @click="copyJSON(m.event.response, 'Response')"
                        class="p-1 rounded hover:bg-gray-500/10 text-gray-400 hover:text-white transition-colors"
                        title="Copy response JSON"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <pre class="text-green-300 font-mono w-full bg-gray-500/5 border border-gray-500/10 p-2 rounded-lg overflow-x-auto">{{ JSON.stringify(m.event.response, null, 2) }}</pre>
                  </div>
                  
                  <!-- Enhanced Metadata Fields -->
                  <div v-if="m.event?.costUsd || m.event?.customerId || m.event?.feature || m.event?.environment" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500 font-semibold">Business Context:</span>
                    <div class="ml-4 space-y-1">
                      <div v-if="m.event.costUsd" class="flex gap-2">
                        <span class="text-gray-500">Cost:</span>
                        <span class="text-green-300 font-mono">${{ m.event.costUsd.toFixed(4) }}</span>
                      </div>
                      <div v-if="m.event.customerId" class="flex gap-2">
                        <span class="text-gray-500">Customer:</span>
                        <span class="text-white font-mono">{{ m.event.customerId }}</span>
                      </div>
                      <div v-if="m.event.subscriptionId" class="flex gap-2">
                        <span class="text-gray-500">Subscription:</span>
                        <span class="text-white font-mono">{{ m.event.subscriptionId }}</span>
                      </div>
                      <div v-if="m.event.feature" class="flex gap-2">
                        <span class="text-gray-500">Feature:</span>
                        <span class="text-white font-mono">{{ m.event.feature }}</span>
                      </div>
                      <div v-if="m.event.environment" class="flex gap-2">
                        <span class="text-gray-500">Environment:</span>
                        <span class="text-blue-300 font-mono">{{ m.event.environment }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Performance Metrics -->
                  <div v-if="m.event?.duration || m.event?.tokensUsed || m.event?.latency" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500 font-semibold">Performance:</span>
                    <div class="ml-4 space-y-1">
                      <div v-if="m.event.duration" class="flex gap-2">
                        <span class="text-gray-500">Duration:</span>
                        <span class="text-purple-300 font-mono">{{ m.event.duration }}ms</span>
                      </div>
                      <div v-if="m.event.tokensUsed" class="flex gap-2">
                        <span class="text-gray-500">Tokens:</span>
                        <span class="text-purple-300 font-mono">{{ m.event.tokensUsed.toLocaleString() }}</span>
                      </div>
                      <div v-if="m.event.latency" class="flex gap-2">
                        <span class="text-gray-500">Latency:</span>
                        <span class="text-purple-300 font-mono">{{ m.event.latency }}ms</span>
                      </div>
                      <div v-if="m.event.modelVersion" class="flex gap-2">
                        <span class="text-gray-500">Model:</span>
                        <span class="text-white font-mono">{{ m.event.modelVersion }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Audit Trail -->
                  <div v-if="m.event?.userAgent || m.event?.ipAddress || m.event?.sessionId || m.event?.correlationId" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <span class="text-gray-500 font-semibold">Audit Trail:</span>
                    <div class="ml-4 space-y-1">
                      <div v-if="m.event.correlationId" class="flex gap-2">
                        <span class="text-gray-500">Correlation ID:</span>
                        <span class="text-gray-400 font-mono text-xs">{{ m.event.correlationId }}</span>
                      </div>
                      <div v-if="m.event.sessionId" class="flex gap-2">
                        <span class="text-gray-500">Session ID:</span>
                        <span class="text-gray-400 font-mono text-xs">{{ m.event.sessionId }}</span>
                      </div>
                      <div v-if="m.event.ipAddress && m.event.ipAddress !== 'unknown'" class="flex gap-2">
                        <span class="text-gray-500">IP Address:</span>
                        <span class="text-gray-400 font-mono">{{ m.event.ipAddress }}</span>
                      </div>
                      <div v-if="m.event.userAgent && m.event.userAgent !== 'unknown'" class="flex gap-2">
                        <span class="text-gray-500">User Agent:</span>
                        <span class="text-gray-400 font-mono text-xs">{{ m.event.userAgent }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Error Context -->
                  <div v-if="m.event?.errorCode || m.event?.errorStack || m.event?.retryCount || m.event?.errorContext" class="flex gap-2 flex-col mt-2 pt-2 border-t border-red-500/20">
                    <span class="text-red-400 font-semibold">⚠️ Error Details:</span>
                    <div class="ml-4 space-y-1">
                      <div v-if="m.event.errorCode" class="flex gap-2">
                        <span class="text-gray-500">Error Code:</span>
                        <span class="text-red-400 font-mono">{{ m.event.errorCode }}</span>
                      </div>
                      <div v-if="m.event.retryCount !== undefined" class="flex gap-2">
                        <span class="text-gray-500">Retry Count:</span>
                        <span class="text-yellow-300 font-mono">{{ m.event.retryCount }}</span>
                      </div>
                      <div v-if="m.event.errorStack" class="flex gap-2 flex-col">
                        <span class="text-gray-500">Stack Trace:</span>
                        <pre class="text-red-300 font-mono text-xs w-full bg-red-500/5 border border-red-500/20 p-2 rounded-lg overflow-x-auto">{{ m.event.errorStack }}</pre>
                      </div>
                      <div v-if="m.event.errorContext" class="flex gap-2 flex-col">
                        <span class="text-gray-500">Error Context:</span>
                        <pre class="text-red-300 font-mono text-xs w-full bg-red-500/5 border border-red-500/20 p-2 rounded-lg overflow-x-auto">{{ JSON.stringify(m.event.errorContext, null, 2) }}</pre>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Metadata (fallback for any other fields) -->
                  <div v-if="m.event?.metadata" class="flex gap-2 flex-col mt-2 pt-2 border-t border-gray-500/10">
                    <div class="flex items-center justify-between">
                      <span class="text-gray-500 w-20 shrink-0">Raw Metadata:</span>
                      <button 
                        @click="copyJSON(m.event.metadata, 'Metadata')"
                        class="p-1 rounded hover:bg-gray-500/10 text-gray-400 hover:text-white transition-colors"
                        title="Copy metadata JSON"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <pre class="text-purple-300 font-mono w-full bg-gray-500/5 border border-gray-500/10 p-2 rounded-lg overflow-x-auto text-xs">{{ JSON.stringify(m.event.metadata, null, 2) }}</pre>
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

      <!-- Toggle button (always visible) -->
      <button 
        @click="sidebarOpen = !sidebarOpen"
        class="absolute top-2 right-4 z-10 p-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 hover:bg-gray-500/20 transition-colors"
        :title="sidebarOpen ? 'Hide tokens' : 'Show tokens'"
      >
        <svg v-if="sidebarOpen" class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <svg v-else class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <!-- Sidebar with transition -->
      <aside 
        :class="[
          'border-l border-gray-500/20 overflow-y-auto transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-96' : 'w-0 border-l-0'
        ]"
      >
        <div v-show="sidebarOpen" class="min-w-96">
          <h2 class="text-xs uppercase font-medium tracking-wide text-gray-500 border-b border-gray-500/20 p-4">Tokens</h2>
          <div class="p-4 space-y-2">
            <!-- Loading State -->
            <SkeletonLoader v-if="refreshing && !tokens.length" type="token" :count="2" />
            
            <!-- Empty State -->
            <EmptyState
              v-else-if="!tokens.length"
              icon="token"
              title="No active tokens"
              description="Grant tokens to agents for time-limited permissions without manual approval"
            />
            
            <!-- Token List -->
            <div v-for="t in tokens" :key="t.token" class="border border-gray-500/20 rounded-lg p-3">
              <div class="flex items-center gap-2 mb-2">
                <div class="text-xs break-all text-gray-400 flex-1">{{ t.token.slice(0,28) }}…</div>
                <button 
                  @click="copy(t.token, 'Token')"
                  class="shrink-0 p-1.5 rounded hover:bg-gray-500/10 text-gray-400 hover:text-white transition-colors"
                  title="Copy full token"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <div class="text-xs uppercase text-gray-400">Agent: <span class="text-white">{{ t.agent }}</span></div>
              <div class="text-xs uppercase text-gray-400">Scopes: <span class="font-mono text-white">{{ t.scopes.join(", ") }}</span></div>
              <div class="text-xs uppercase text-gray-400">Expires: <span class="text-white">{{ new Date(t.expiresAt).toLocaleTimeString() }}</span></div>
              <div class="text-xs uppercase text-gray-400">Status: <b :class="{'text-green-400': t.status==='active', 'text-amber-400': t.status==='paused', 'text-red-500': t.status==='revoked'}">{{ t.status }}</b></div>
              <div v-if="t.status!=='revoked'" class="flex gap-2 mt-2 text-sm font-medium">
                <button class="px-3 py-1 rounded-lg bg-red-500" @click="revoke(t)">Revoke</button>
                <button v-if="t.status==='active'" class="px-3 py-1 rounded-lg bg-gray-500/15 border border-gray-500/20" @click="pause(t)">Pause</button>
                <button v-else-if="t.status==='paused'" class="px-3 py-1 rounded-lg bg-blue-300 text-black" @click="resume(t)">Resume</button>
              </div>
              <div v-else class="text-xs text-gray-500 mt-2">Token is permanently revoked</div>
            </div>
          </div>
        </div>
      </aside>
    </section>

    <!-- Consent modal -->
    <div v-if="ask" class="fixed inset-0 bg-black/80 grid place-items-center">
      <div class="bg-black border border-gray-500/20 rounded-lg p-6 w-[560px]">
        <h2 class="text-lg font-semibold mb-2">Permission Request</h2>
        <p class="mb-4">
          <b>{{ ask.agent }}</b> wants to
          <b>{{ humanIntent(ask) }}</b>.
        </p>
        
        <div class="flex gap-3 justify-end font-medium text-sm">
          <button 
            :disabled="modalLoading" 
            class="px-4 py-2 rounded-lg bg-gray-500/15 border border-gray-500/20 disabled:opacity-50" 
            @click="deny">
            {{ modalLoading ? 'Processing...' : 'Deny' }}
          </button>
          <button 
            :disabled="modalLoading" 
            class="px-4 py-2 rounded-lg bg-blue-300 text-black disabled:opacity-50" 
            @click="allowOnce">
            {{ modalLoading ? 'Processing...' : 'Allow once' }}
          </button>
          <button 
            :disabled="modalLoading" 
            class="px-4 py-2 rounded-lg bg-green-400 text-black disabled:opacity-50" 
            @click="allowFor(3600, [ask.intent])">
            {{ modalLoading ? 'Processing...' : 'Allow 1h' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
