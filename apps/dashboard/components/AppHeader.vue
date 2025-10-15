<script setup lang="ts">
defineProps<{
  currentPage: 'feed' | 'timeline' | 'metrics' | 'roles' | 'devtools'
}>()
</script>

<template>
  <header class="p-4 py-2 border-b border-gray-500/20 flex items-center justify-between shrink-0">
    <h1 class="text-lg space-x-2 flex items-center">
      <div class="flex items-center gap-1">
        <img src="~/assets/img/logo.png" alt="Echos" class="w-6 h-6" />
        <span class="text-white font-medium text-base">Echos</span>
      </div>
      <span class="text-gray-500/40 text-sm">/</span>
      <nav class="text-xs flex items-center gap-2 bg-gray-500/5 border border-gray-500/20 rounded-xl p-0.5 px-0.5">
        <NuxtLink 
          to="/" 
          :class="currentPage === 'feed' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Feed
        </NuxtLink>
        <NuxtLink 
          to="/timeline" 
          :class="currentPage === 'timeline' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Timeline
        </NuxtLink>
        <NuxtLink 
          to="/metrics" 
          :class="currentPage === 'metrics' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Metrics
        </NuxtLink>
        <NuxtLink 
          to="/roles" 
          :class="currentPage === 'roles' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          Roles
        </NuxtLink>
        <NuxtLink 
          to="/devtools" 
          :class="currentPage === 'devtools' 
            ? 'text-white bg-gray-500/20 rounded-lg p-1 px-2 border border-gray-500/20' 
            : 'text-gray-400 hover:text-white bg-transparent border border-transparent rounded-lg p-1 px-2'">
          DevTools
        </NuxtLink>
      </nav>
    </h1>
    
    <!-- Slot for page-specific actions -->
    <div class="flex items-center gap-2">
      <slot name="actions"></slot>
    </div>
  </header>
</template>

