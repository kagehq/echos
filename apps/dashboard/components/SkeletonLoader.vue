<script setup lang="ts">
defineProps<{
  type?: 'text' | 'card' | 'feed' | 'token' | 'metric'
  count?: number
}>()
</script>

<template>
  <!-- Text Skeleton -->
  <div v-if="type === 'text'" class="animate-pulse space-y-2">
    <div v-for="i in (count || 3)" :key="i" class="h-4 bg-gray-500/10 rounded" :style="{ width: i === 1 ? '60%' : i === 2 ? '80%' : '70%' }"></div>
  </div>

  <!-- Card Skeleton -->
  <div v-else-if="type === 'card'" class="animate-pulse">
    <div v-for="i in (count || 1)" :key="i" class="border border-gray-500/20 rounded-lg p-4 mb-3 bg-gray-500/5">
      <div class="h-4 bg-gray-500/10 rounded w-3/4 mb-3"></div>
      <div class="h-3 bg-gray-500/10 rounded w-1/2 mb-2"></div>
      <div class="h-3 bg-gray-500/10 rounded w-2/3"></div>
    </div>
  </div>

  <!-- Feed Item Skeleton -->
  <div v-else-if="type === 'feed'" class="animate-pulse space-y-1">
    <div v-for="i in (count || 5)" :key="i" class="flex items-center gap-8 py-2 px-2">
      <div class="h-3 bg-gray-500/10 rounded w-16"></div>
      <div class="h-3 bg-gray-500/10 rounded w-12"></div>
      <div class="h-3 bg-gray-500/10 rounded w-20"></div>
      <div class="h-3 bg-gray-500/10 rounded flex-1"></div>
      <div class="h-3 bg-gray-500/10 rounded w-4"></div>
    </div>
  </div>

  <!-- Token Skeleton -->
  <div v-else-if="type === 'token'" class="animate-pulse">
    <div v-for="i in (count || 2)" :key="i" class="border border-gray-500/20 rounded-lg p-3 mb-2">
      <div class="h-3 bg-gray-500/10 rounded w-full mb-2"></div>
      <div class="h-2 bg-gray-500/10 rounded w-2/3 mb-1"></div>
      <div class="h-2 bg-gray-500/10 rounded w-1/2 mb-1"></div>
      <div class="h-2 bg-gray-500/10 rounded w-1/3"></div>
    </div>
  </div>

  <!-- Metric Card Skeleton -->
  <div v-else-if="type === 'metric'" class="animate-pulse">
    <div v-for="i in (count || 3)" :key="i" class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-6">
      <div class="flex items-center justify-between mb-2">
        <div class="h-3 bg-gray-500/10 rounded w-1/3"></div>
        <div class="h-5 w-5 bg-gray-500/10 rounded"></div>
      </div>
      <div class="h-8 bg-gray-500/10 rounded w-1/2 mb-1"></div>
      <div class="h-2 bg-gray-500/10 rounded w-2/3"></div>
    </div>
  </div>

  <!-- Default Skeleton -->
  <div v-else class="animate-pulse space-y-3">
    <div class="h-4 bg-gray-500/10 rounded w-full"></div>
    <div class="h-4 bg-gray-500/10 rounded w-5/6"></div>
    <div class="h-4 bg-gray-500/10 rounded w-4/6"></div>
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>

