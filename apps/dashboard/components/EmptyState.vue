<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
    <!-- Icon -->
    <div v-if="icon === 'search'" class="w-12 h-12 rounded-full bg-gray-500/10 flex items-center justify-center mb-4">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
    
    <div v-else-if="icon === 'inbox'" class="w-12 h-12 rounded-full bg-gray-500/10 flex items-center justify-center mb-4">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    </div>
    
    <div v-else-if="icon === 'token'" class="w-12 h-12 rounded-full bg-gray-500/10 flex items-center justify-center mb-4">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    </div>
    
    <div v-else-if="icon === 'webhook'" class="w-12 h-12 rounded-full bg-gray-500/10 flex items-center justify-center mb-4">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
    
    <div v-else-if="icon === 'template'" class="w-12 h-12 rounded-full bg-gray-500/10 flex items-center justify-center mb-4">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    
    <div v-else-if="icon === 'clock'" class="w-12 h-12 rounded-full bg-gray-500/10 flex items-center justify-center mb-4">
      <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>

    <!-- Title and Description -->
    <h3 class="text-base font-medium text-white mb-1">{{ title }}</h3>
    <p v-if="description" class="text-sm text-gray-400 max-w-md mb-4">{{ description }}</p>
    
    <!-- Optional Action Button -->
    <button 
      v-if="action"
      @click="action.onClick"
      class="mt-2 px-4 py-2 rounded-lg bg-blue-300 text-black text-sm font-medium hover:bg-blue-400 transition-colors"
    >
      {{ action.label }}
    </button>
    
    <!-- Slot for custom content -->
    <slot></slot>
  </div>
</template>

