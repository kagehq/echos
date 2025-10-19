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

    // Redirect to main dashboard
    await navigateTo('/')
  } catch (err: any) {
    console.error('Login error:', err)
    
    // Provide human-friendly error messages
    if (err.message?.includes('Invalid login credentials')) {
      error.value = 'Invalid email or password. Please try again.'
    } else if (err.message?.includes('Email not confirmed')) {
      error.value = 'Please confirm your email address before signing in.'
    } else if (err.message?.includes('Invalid email')) {
      error.value = 'Please enter a valid email address.'
    } else {
      error.value = 'Unable to sign in. Please check your credentials and try again.'
    }
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
        <div class="mb-0">
          <img src="~/assets/img/logo.png" alt="Echos" class="w-14 h-14 mx-auto">
        </div>
        <h2 class="text-2xl font-semibold text-white mb-2">Welcome back</h2>
        <p class="text-gray-400 text-sm">Sign in to your account</p>
      </div>

      <!-- Login Form -->
      <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
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
              :disabled="loading"
              class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="you@company.com"
            />
          </div>

          <!-- Password -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium text-white">
                Password
              </label>
              <NuxtLink to="/forgot-password" class="text-sm text-blue-400 hover:text-blue-300">
                Forgot?
              </NuxtLink>
            </div>
            <input
              v-model="form.password"
              type="password"
              required
              :disabled="loading"
              class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
            class="w-full bg-blue-300 hover:bg-blue-400 disabled:bg-blue-300/50 disabled:cursor-not-allowed text-black font-medium py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center space-x-2"
          >
            <span v-if="loading" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-black"></span>
            <span>{{ loading ? 'Signing in...' : 'Sign in' }}</span>
          </button>
        </form>

        <!-- Sign Up Link -->
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-400">
            Don't have an account?
            <NuxtLink to="/signup" class="text-blue-400 hover:text-blue-300">
              Sign up
            </NuxtLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

