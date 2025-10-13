<script setup lang="ts">
import { ref, onMounted } from 'vue';
type Msg = { type: "event"|"ask"|"decision"; event?: any; id?: string; status?: string };

const feed = ref<any[]>([]);
const askQueue = ref<any|null>(null);
const connected = ref<boolean>(false);

const { $ws } = useNuxtApp();
onMounted(() => {
  connected.value = $ws.readyState === 1;
  $ws.addEventListener("open", () => { connected.value = true; });
  $ws.addEventListener("close", () => { connected.value = false; });
  // Load recent events on first paint
  $fetch('http://127.0.0.1:3434/events/recent').then((r:any)=>{
    if (Array.isArray(r.events)) {
      for (const e of r.events) feed.value.push({ type:'event', event: e });
    }
  }).catch(()=>{});
  $ws.addEventListener("message", (e: MessageEvent) => {
    const msg: Msg = JSON.parse(e.data);
    feed.value.unshift(msg);
    if (msg.type === "ask") {
      askQueue.value = msg.event;
    }
    // Keep only recent 200 items
    if (feed.value.length > 200) feed.value.length = 200;
  });
});

async function decide(status: "allow"|"block") {
  if (!askQueue.value) return;
  try {
    await $fetch(`http://127.0.0.1:3434/decide/${askQueue.value.id}`, { method:"POST", body:{ status }});
  } catch (e) {
    console.error(`Failed to send decision:`, e);
  }
  askQueue.value = null;
}
</script>

<template>
  <div class="min-h-screen bg-black text-neutral-100">
    <header class="p-4 border-b border-gray-500/15 flex items-center justify-between">
      <h1 class="text-lg space-x-2 flex items-center">
        <span class="text-white font-semibold ">Echos</span>
        <span class="text-gray-500/40 text-sm">/</span>
        <span class="text-gray-400 text-sm">Live Feed</span>
      </h1>
      <div class="flex items-center gap-2 text-xs">
        <span :class="['inline-block w-2 h-2 rounded-full', connected ? 'bg-green-400' : 'bg-red-500']"></span>
        <span class="text-gray-400 text-xs">
          {{ connected ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
    </header>

    <main class="p-4 space-y-2">
      <div v-for="(m,i) in feed" :key="i" class="border text-sm border-gray-500/15 rounded-lg p-3">
        <div v-if="m.type==='event'">
          <div class="text-xs text-gray-500">{{ new Date(m.event.ts).toLocaleTimeString() }}</div>
          <div class="font-mono">
            <span class="text-green-400">event</span> · <b>{{ m.event.intent }}</b> → {{ m.event.target }}
          </div>
        </div>
        <div v-else-if="m.type==='ask'">
          <div class="text-sm opacity-70" v-if="m.event?.ts">{{ new Date(m.event.ts).toLocaleTimeString() }}</div>
          <div class="text-amber-400 font-semibold">ask</div>
          <div class="font-mono">{{ m.event.intent }} → {{ m.event.target }}</div>
        </div>
        <div v-else-if="m.type==='decision'">
          <div class="text-sm opacity-70" v-if="m.ts">{{ new Date(m.ts).toLocaleTimeString() }}</div>
          <div class="font-mono">
            <span class="text-cyan-400">decision</span> · 
            <b :class="m.status === 'allow' ? 'text-green-400' : 'text-red-400'">{{ m.status }}</b>
          </div>
        </div>
      </div>
    </main>

    <div v-if="askQueue" class="fixed inset-0 bg-black/80 grid place-items-center">
      <div class="bg-black border border-gray-500/10 rounded-lg p-6 w-[520px]">
        <h2 class="text-lg font-semibold mb-2">Agent requests permission</h2>
        <p class="mb-4">
          <b>{{ askQueue.agent }}</b> wants to perform
          <b>{{ askQueue.intent }}</b> on <b>{{ askQueue.target }}</b>.
        </p>
        <div class="flex gap-3 justify-end">
          <button class="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-500/10 border border-gray-500/15" @click="decide('block')">Deny</button>
          <button class="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-300 text-black border border-blue-300" @click="decide('allow')">Allow once</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
html,body,#__nuxt { height: 100%; }
</style>

