<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, remove } = useToast()

const getToastClasses = (type: string) => {
  const baseClasses = 'px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm flex items-start gap-3 min-w-[300px] max-w-[500px]'
  
  switch (type) {
    case 'success':
      return `${baseClasses} bg-green-300/10 border-green-300/10 text-green-300`
    case 'error':
      return `${baseClasses} bg-red-500/10 border-red-500/10 text-red-500`
    case 'warning':
      return `${baseClasses} bg-amber-300/10 border-amber-300/10 text-amber-300`
    case 'info':
    default:
      return `${baseClasses} bg-blue-300/10 border-blue-300/10 text-blue-300`
  }
}

const getIcon = (type: string) => {
  switch (type) {
    case 'success':
      return '✓'
    case 'error':
      return '✗'
    case 'warning':
      return '⚠'
    case 'info':
    default:
      return 'ℹ'
  }
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="getToastClasses(toast.type)"
        class="pointer-events-auto animate-slide-in flex items-center justify-between"
      >
				<div class="flex items-center gap-2">
					<div class="text-lg font-bold shrink-0">{{ getIcon(toast.type) }}</div>
					<div class="flex-1 text-sm">{{ toast.message }}</div>
				</div>
        <button
          @click="remove(toast.id)"
          class="text-gray-400 hover:text-white transition-colors shrink-0"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.animate-slide-in {
  animation: slide-in 0.3s ease;
}
</style>

