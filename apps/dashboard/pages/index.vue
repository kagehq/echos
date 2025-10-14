<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

definePageMeta({
  ssr: false
})

useHead({
  title: 'Feed - Echos',
  meta: [
    { name: 'description', content: 'Live feed of agent activities and permission requests' }
  ]
})

const feed = ref<any[]>([])
const ask = ref<any|null>(null)
const tokens = ref<any[]>([])
const connected = ref(false)
const modalError = ref<string|null>(null)
const modalLoading = ref(false)
const timeoutId = ref<number|null>(null)
const sidebarOpen = ref(true)
const refreshing = ref(false)
const searchQuery = ref('')
const expandedEvents = ref<Set<number>>(new Set())

// Get WebSocket only on client side
let $ws: any = null
if (process.client) {
  $ws = useNuxtApp().$ws
}

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
        modalError.value = "⏱️ Request timed out. The agent may have moved on."
        setTimeout(() => { ask.value = null; modalError.value = null }, 3000)
      }, 120000) // 2 minutes
    }
  })
}

onMounted(async () => {
  // Ensure we have WebSocket access
  if (!$ws) {
    $ws = useNuxtApp().$ws
  }
  
  // Restore sidebar state from localStorage
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('echos-sidebar-open')
    if (saved !== null) {
      sidebarOpen.value = JSON.parse(saved)
    }
  }

  // Check connection state periodically and auto-refresh on reconnect
  let previousState = $ws.readyState
  const checkConnection = async () => {
    const currentState = $ws.readyState
    const isConnected = currentState === WebSocket.OPEN
    const wasDisconnected = previousState !== WebSocket.OPEN
    
    if (connected.value !== isConnected) {
      connected.value = isConnected
      
      if (isConnected && wasDisconnected && previousState !== null) {
        // Reconnected - refresh data
        try {
          await refreshTokens()
          const eventsRes = await $fetch<{events: any[]}>('http://127.0.0.1:3434/timeline')
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

  $ws.addEventListener("message", (e: MessageEvent) => {
    const msg = JSON.parse(e.data)
    feed.value.unshift(msg)
    if (msg.type === "ask") { ask.value = msg.event; modalError.value = null }
    if (msg.type === "token") refreshTokens()
  })
  
  // Load initial tokens
  await refreshTokens()
  
  // Fetch initial timeline/events if needed
  try {
    const eventsRes = await $fetch<{events: any[]}>('http://127.0.0.1:3434/timeline')
    if (eventsRes?.events) {
      feed.value = eventsRes.events.slice(0, 50)
    }
  } catch(e) {
    console.error('Failed to load timeline:', e)
  }
})

async function refreshTokens(){
  try {
    const r = await $fetch<{tokens: any[]}>('http://127.0.0.1:3434/tokens/list')
    tokens.value = r?.tokens || []
  } catch(e) {
    console.error('Failed to load tokens:', e)
  }
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
  modalError.value = null
  try {
    await $fetch(`http://127.0.0.1:3434/decide/${ask.value.id}`, { method:"POST", body:{ status:"block" }})
    if (timeoutId.value) clearTimeout(timeoutId.value)
    ask.value=null 
  } catch(e) {
    modalError.value = "❌ Failed to send decision. Retry?"
  } finally {
    modalLoading.value = false
  }
}

async function allowOnce(){ 
  if(!ask.value) return; 
  modalLoading.value = true
  modalError.value = null
  try {
    await $fetch(`http://127.0.0.1:3434/decide/${ask.value.id}`, { method:"POST", body:{ status:"allow" }})
    if (timeoutId.value) clearTimeout(timeoutId.value)
    ask.value=null
  } catch(e) {
    modalError.value = "❌ Failed to send decision. Retry?"
  } finally {
    modalLoading.value = false
  }
}

async function allowFor(durationSec:number, scopes:string[]){ 
  if(!ask.value) return;
  modalLoading.value = true
  modalError.value = null
  try {
    await $fetch(`http://127.0.0.1:3434/decide/${ask.value.id}`, { method:"POST", body:{ status:"allow", agent: ask.value.agent, grant:{ scopes, durationSec, reason:"user approved" } }})
    if (timeoutId.value) clearTimeout(timeoutId.value)
    ask.value=null
    await refreshTokens()
  } catch(e) {
    modalError.value = "❌ Failed to grant token. Retry?"
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
        // Reload feed data
        const eventsRes = await $fetch<{events: any[]}>('http://127.0.0.1:3434/timeline')
        if (eventsRes?.events) {
          feed.value = eventsRes.events.slice(0, 50)
        }
        // Reload tokens
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

async function revoke(t:any){ await $fetch('http://127.0.0.1:3434/tokens/revoke', { method:"POST", body:{ token: t.token }}); await refreshTokens() }
async function pause(t:any){ await $fetch('http://127.0.0.1:3434/tokens/pause',  { method:"POST", body:{ token: t.token }}); await refreshTokens() }
async function resume(t:any){await $fetch('http://127.0.0.1:3434/tokens/resume', { method:"POST", body:{ token: t.token }}); await refreshTokens() }
</script>

<template>
  <div class="h-screen bg-black flex flex-col overflow-hidden">
    <header class="p-4 py-2 border-b border-gray-500/20 flex items-center justify-between shrink-0">
      <h1 class="text-lg space-x-2 flex items-center">
        <div class="flex items-center gap-1">
          <img src="~/assets/img/logo.png" alt="Echos" class="w-6 h-6"></img>
          <span class="text-white font-medium text-base">Echos</span>
        </div>
        <span class="text-gray-500/50 text-sm">/</span>
        <nav class="text-xs flex items-center gap-2 bg-gray-500/5 border border-gray-500/15 rounded-lg p-0.5 px-1">
          <NuxtLink to="/" class="text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20">Feed</NuxtLink>
          <NuxtLink to="/timeline" class="text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2">Timeline</NuxtLink>
          <NuxtLink to="/metrics" class="text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2">Metrics</NuxtLink>
        </nav>
        <!-- <span class="text-gray-400 text-sm">Live Feed</span> -->
      </h1>
      <div class="flex items-center gap-3 text-xs">
        <button 
          :disabled="refreshing"
          class="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs hover:bg-gray-500/20 disabled:opacity-50 transition-colors" 
          @click="refresh">
          {{ refreshing ? 'Refreshing...' : 'Refresh' }}
        </button>
        <span :class="['inline-block w-2 h-2 rounded-full', connected ? 'bg-green-300' : 'bg-red-500']"></span>
        <span class="text-gray-400 text-xs">
          {{ connected ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
    </header>

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
          <div v-if="!getFilteredFeed().length" class="text-center text-gray-500 py-8">
            {{ searchQuery ? 'No matching events found' : 'No events yet' }}
          </div>
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
              
              <!-- Method/Type -->
              <div v-if="m.type==='event'" class="w-20 shrink-0 text-white">{{ m.event.intent?.split('.')[0]?.toUpperCase() || 'EVENT' }}</div>
              <div v-else-if="m.type==='ask'" class="w-20 shrink-0 text-white">ASK</div>
              <div v-else-if="m.type==='decision'" class="w-20 shrink-0 text-white">DECIDE</div>
              <div v-else-if="m.type==='token'" class="w-20 shrink-0 text-white">{{ m.action?.toUpperCase() || 'TOKEN' }}</div>
              
              <!-- Path/Target -->
              <div v-if="m.type==='event'" class="flex-1 text-gray-400">{{ m.event.target || m.event.intent }}</div>
              <div v-else-if="m.type==='ask'" class="flex-1 text-gray-400">{{ m.event.target || m.event.intent }}</div>
              <div v-else-if="m.type==='decision'" class="flex-1">
                <span :class="m.payload?.status === 'allow' ? 'text-green-300' : 'text-red-400'">
                  {{ m.payload?.status === 'allow' ? '✓ Allowed' : '✗ Denied' }}
                </span>
                <span v-if="m.payload?.token" class="text-gray-400 ml-2">- token granted</span>
              </div>
              <div v-else-if="m.type==='token'" class="flex-1 text-gray-400">{{ m.token?.slice(0, 40) }}...</div>
              
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
            <div v-if="!tokens.length" class="text-sm text-gray-500">You don't have any active tokens</div>
            <div v-for="t in tokens" :key="t.token" class="border border-gray-500/20 rounded-lg p-3">
              <div class="text-xs break-all text-gray-400 mb-2">{{ t.token.slice(0,28) }}…</div>
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
        
        <!-- Error message -->
        <div v-if="modalError" class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {{ modalError }}
        </div>
        
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
