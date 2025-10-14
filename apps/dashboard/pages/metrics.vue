<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { Line } from 'vue-chartjs';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { useDaemonApi } from '~/composables/useDaemonApi';
import { useToast } from '~/composables/useToast';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

definePageMeta({
  ssr: false
});

useHead({
  title: 'Metrics - Echos',
  meta: [
    { name: 'description', content: 'Performance metrics and analytics for agent activities' }
  ]
});

// Watchdog timer for daemon API calls
const { request, daemonError } = useDaemonApi();
const { error: showError } = useToast();

const { $ws } = useNuxtApp() as any;
const refreshing = ref(false);
const timeRange = ref('1h'); // 1h, 24h, 7d, 30d
const events = ref<any[]>([]);

// Metrics calculations
const metrics = computed(() => {
  if (!events.value) return {
    total: 0,
    allowed: 0,
    asked: 0,
    blocked: 0,
    avgTime: 0,
    agents: 0
  };

  const now = Date.now();
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  
  const rangeMs = ranges[timeRange.value] || ranges['1h'];
  const filtered = events.value.filter(e => {
    const ts = e.event?.ts || e.ts || 0;
    return (now - ts) <= rangeMs;
  });

  const allowed = filtered.filter(e => e.type === 'event' && !e.event?.tokenAttached).length;
  const asked = filtered.filter(e => e.type === 'ask').length;
  const blocked = filtered.filter(e => e.type === 'decision' && e.payload?.status === 'block').length;
  const rolesApplied = filtered.filter(e => e.type === 'roleApplied').length;
  const tokensIssued = filtered.filter(e => e.type === 'token' && e.action === 'issued').length;
  const uniqueAgents = new Set([
    ...filtered.filter(e => e.event?.agent).map(e => e.event.agent),
    ...filtered.filter(e => e.type === 'roleApplied' && e.agent).map(e => e.agent)
  ].filter(Boolean)).size;

  return {
    total: filtered.length,
    allowed,
    asked,
    blocked,
    rolesApplied,
    tokensIssued,
    avgTime: 0, // TODO: Calculate from metadata if available
    agents: uniqueAgents
  };
});

// Top intents
const topIntents = computed(() => {
  if (!events.value) return [];
  
  const now = Date.now();
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  
  const rangeMs = ranges[timeRange.value] || ranges['1h'];
  const filtered = events.value.filter(e => {
    const ts = e.event?.ts || e.ts || 0;
    return (now - ts) <= rangeMs && e.event?.intent;
  });

  const intentCounts = new Map<string, number>();
  filtered.forEach(e => {
    const intent = e.event?.intent;
    if (intent) {
      intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
    }
  });

  return Array.from(intentCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent, count]) => ({ intent, count }));
});

// Activity chart data
const chartData = computed(() => {
  if (!events.value) return { labels: [], datasets: [] };

  const now = Date.now();
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  
  const rangeMs = ranges[timeRange.value] || ranges['1h'];
  const buckets = timeRange.value === '1h' ? 12 : timeRange.value === '24h' ? 24 : timeRange.value === '7d' ? 7 : 30;
  const bucketSize = rangeMs / buckets;

  const labels: string[] = [];
  const data: number[] = [];

  for (let i = buckets - 1; i >= 0; i--) {
    const bucketEnd = now - (i * bucketSize);
    const bucketStart = bucketEnd - bucketSize;
    
    const count = events.value.filter(e => {
      const ts = e.event?.ts || e.ts || 0;
      return ts >= bucketStart && ts < bucketEnd;
    }).length;

    data.push(count);
    
    // Format label based on time range
    if (timeRange.value === '1h') {
      const date = new Date(bucketEnd);
      labels.push(date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    } else if (timeRange.value === '24h') {
      const date = new Date(bucketEnd);
      labels.push(date.toLocaleTimeString('en-US', { hour: '2-digit' }));
    } else {
      const date = new Date(bucketEnd);
      labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
  }

  return {
    labels,
    datasets: [{
      label: 'Events',
      data,
      fill: true,
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4
    }]
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      mode: 'index' as const,
      intersect: false
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0
      }
    }
  }
};

const refresh = async () => {
  refreshing.value = true;
  try {
    await Promise.all([
      (async () => {
        // Use watchdog timer
        const result = await request<{events: any[]}>('/timeline');
        if (result?.events) {
          events.value = result.events;
          localStorage.setItem('timeline', JSON.stringify(events.value));
        }
      })(),
      new Promise(resolve => setTimeout(resolve, 500))
    ]);
  } catch (e) {
    console.error('Failed to refresh:', e);
  } finally {
    refreshing.value = false;
  }
};

onMounted(async () => {
  if (typeof window === 'undefined') return;
  
  // Load events from API first with watchdog timer
  const result = await request<{events: any[]}>('/timeline');
  if (result?.events) {
    events.value = result.events;
    // Save to localStorage
    localStorage.setItem('timeline', JSON.stringify(events.value));
  } else {
    // Fallback to localStorage if daemon unreachable
    const stored = localStorage.getItem('timeline');
    if (stored) {
      try {
        events.value = JSON.parse(stored);
      } catch {}
    }
  }

  // Set up WebSocket listener
  if ($ws) {
    $ws.addEventListener('message', (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data);
        if (data && typeof data === 'object') {
          events.value = [data, ...events.value];
          // Update localStorage
          localStorage.setItem('timeline', JSON.stringify(events.value));
        }
      } catch {}
    });
  }

  // Watch for daemon errors and show toast
  watch(daemonError, (error) => {
    if (error) {
      showError("Connection error. The daemon may be down.")
    }
  });
});
</script>

<template>
  <div class="h-screen bg-black text-neutral-100 flex flex-col overflow-hidden">
    <AppHeader currentPage="metrics">
      <template #actions>
        <!-- Time range selector -->
        <div class="relative">
          <select 
            v-model="timeRange" 
            class="appearance-none px-3 py-1.5 pr-8 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs text-white hover:bg-gray-500/15 hover:border-gray-500/20 focus:outline-none focus:ring-2 focus:ring-gray-500/10 focus:border-gray-500/10 transition-all cursor-pointer"
          >
            <option value="1h" class="bg-gray-800 text-white">Last Hour</option>
            <option value="24h" class="bg-gray-800 text-white">Last 24 Hours</option>
            <option value="7d" class="bg-gray-800 text-white">Last 7 Days</option>
            <option value="30d" class="bg-gray-800 text-white">Last 30 Days</option>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        <span class="text-gray-500/50">|</span>
        
        <!-- Refresh button -->
        <button 
          :disabled="refreshing"
          class="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-xs hover:bg-gray-500/20 disabled:opacity-50 transition-colors" 
          @click="refresh">
          {{ refreshing ? 'Refreshing...' : 'Refresh' }}
        </button>
      </template>
    </AppHeader>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto p-6">
      <!-- Loading State -->
      <div v-if="refreshing && !events.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <SkeletonLoader type="metric" :count="6" />
      </div>
      
      <!-- Metric cards -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <!-- Total Events -->
        <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400 text-sm">Total Events</span>
            <svg class="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div class="text-3xl font-bold">{{ metrics.total }}</div>
        </div>

        <!-- Allowed -->
        <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400 text-sm">Allowed</span>
            <svg class="w-5 h-5 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="text-3xl font-bold text-green-300">{{ metrics.allowed }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ metrics.total > 0 ? Math.round((metrics.allowed / metrics.total) * 100) : 0 }}% of total</div>
        </div>

        <!-- Asked -->
        <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400 text-sm">Asked</span>
            <svg class="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div class="text-3xl font-bold text-amber-300">{{ metrics.asked }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ metrics.total > 0 ? Math.round((metrics.asked / metrics.total) * 100) : 0 }}% of total</div>
        </div>

        <!-- Blocked -->
        <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400 text-sm">Blocked</span>
            <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div class="text-3xl font-bold text-red-400">{{ metrics.blocked }}</div>
          <div class="text-xs text-gray-500 mt-1">{{ metrics.total > 0 ? Math.round((metrics.blocked / metrics.total) * 100) : 0 }}% of total</div>
        </div>

        <!-- Roles Applied -->
        <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400 text-sm">Roles Applied</span>
            <svg class="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div class="text-3xl font-bold text-purple-300">{{ metrics.rolesApplied }}</div>
          <div class="text-xs text-gray-500 mt-1">Policy assignments</div>
        </div>

        <!-- Tokens Issued -->
        <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400 text-sm">Tokens Issued</span>
            <svg class="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div class="text-3xl font-bold text-blue-300">{{ metrics.tokensIssued }}</div>
          <div class="text-xs text-gray-500 mt-1">Authorization tokens</div>
        </div>

        <!-- Agents -->
        <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400 text-sm">Active Agents</span>
            <svg class="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div class="text-3xl font-bold text-purple-300">{{ metrics.agents }}</div>
        </div>
      </div>

      <!-- Activity Chart -->
      <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6 mb-6">
        <h2 class="text-lg font-semibold mb-4">Activity Over Time</h2>
        <div class="h-64">
          <Line :data="chartData" :options="chartOptions" />
        </div>
      </div>

      <!-- Top Intents -->
      <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
        <h2 class="text-lg font-semibold mb-4">Top Intents</h2>
        <div class="space-y-3">
          <div v-if="topIntents.length === 0" class="text-gray-500 text-center py-8">
            No events in selected time range
          </div>
          <div v-for="(item, i) in topIntents" :key="item.intent" class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-gray-500 text-sm w-6">{{ i + 1 }}.</span>
              <span class="font-mono text-sm">{{ item.intent }}</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-32 h-2 bg-gray-500/20 rounded-full overflow-hidden">
                <div class="h-full bg-blue-300 rounded-full" :style="{ width: `${(item.count / topIntents[0].count) * 100}%` }"></div>
              </div>
              <span class="text-sm text-gray-400 w-12 text-right">{{ item.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
