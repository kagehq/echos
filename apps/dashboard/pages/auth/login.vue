<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

useHead({
  title: 'Sign In - Echos',
})

const supabase = useSupabaseClient()
const loading = ref(false)
const error = ref('')

const form = ref({
  email: '',
  password: ''
})

const handleLogin = async () => {
  loading.value = true
  error.value = ''

  try {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: form.value.email,
      password: form.value.password
    })

    if (authError) throw authError

    // Redirect to dashboard
    await navigateTo('/dashboard')
  } catch (err: any) {
    console.error('Login error:', err)
    error.value = err.message || 'Invalid email or password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-black flex items-center justify-center px-4">
    <div class="max-w-md w-full">
      <!-- Logo and Title -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-white mb-2">Welcome back</h1>
        <p class="text-gray-400">Sign in to your account</p>
      </div>

      <!-- Login Form -->
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-8">
        <form @submit.prevent="handleLogin" class="space-y-5">
          <!-- Email -->
          <div>
            <label class="block text-sm font-medium text-white mb-2">
              Email
            </label>
            <input
              v-model="form.email"
              type="email"
              required
              autofocus
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@company.com"
            />
          </div>

          <!-- Password -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium text-white">
                Password
              </label>
              <NuxtLink to="/auth/forgot-password" class="text-sm text-blue-400 hover:text-blue-300">
                Forgot?
              </NuxtLink>
            </div>
            <input
              v-model="form.password"
              type="password"
              required
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <!-- Error Message -->
          <div v-if="error" class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p class="text-sm text-red-400">{{ error }}</p>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {{ loading ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>

        <!-- Sign Up Link -->
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-400">
            Don't have an account?
            <NuxtLink to="/auth/signup" class="text-blue-400 hover:text-blue-300">
              Sign up
            </NuxtLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

