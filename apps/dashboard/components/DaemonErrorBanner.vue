<script setup lang="ts">
defineProps<{
  show: boolean
  onRetry: () => void | Promise<void>
}>()
</script>

<template>
  <div v-if="show" class="bg-red-500/10 border-b border-red-500/10 px-4 py-3 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div>
        <p class="text-red-300 font-semibold text-sm">Cannot connect to Echos daemon</p>
        <p class="text-red-400/80 text-xs">Make sure the daemon is running on port 3434</p>
      </div>
    </div>
    <button 
      @click="onRetry"
      class="px-3 py-1.5 rounded-lg font-medium bg-red-500 border border-red-500/10 text-xs text-white hover:bg-red-500 transition-colors">
      Retry
    </button>
  </div>
</template>

