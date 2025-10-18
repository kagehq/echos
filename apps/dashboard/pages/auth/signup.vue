<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

useHead({
  title: 'Sign Up - Echos',
})

const supabase = useSupabaseClient()
const loading = ref(false)
const error = ref('')

const form = ref({
  email: '',
  password: '',
  organizationName: '',
  fullName: ''
})

// Generate slug from organization name
const generateSlug = (name: string) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const handleSignup = async () => {
  loading.value = true
  error.value = ''

  try {
    // 1. Sign up the user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.value.email,
      password: form.value.password,
      options: {
        data: {
          full_name: form.value.fullName
        }
      }
    })

    if (authError) throw authError
    if (!authData.user) throw new Error('No user returned from signup')

    // 2. Create organization and profile using the helper function
    const slug = generateSlug(form.value.organizationName)
    
    const { data: orgData, error: orgError } = await supabase.rpc(
      'create_organization_with_owner',
      {
        org_name: form.value.organizationName,
        org_slug: slug,
        user_id: authData.user.id,
        user_email: form.value.email,
        user_name: form.value.fullName || null
      }
    )

    if (orgError) throw orgError

    // 3. Redirect to dashboard
    await navigateTo('/dashboard')
  } catch (err: any) {
    console.error('Signup error:', err)
    error.value = err.message || 'Failed to sign up. Please try again.'
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
        <h1 class="text-3xl font-bold text-white mb-2">Create your account</h1>
        <p class="text-gray-400">Start monitoring your AI agents</p>
      </div>

      <!-- Signup Form -->
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-8">
        <form @submit.prevent="handleSignup" class="space-y-5">
          <!-- Full Name -->
          <div>
            <label class="block text-sm font-medium text-white mb-2">
              Full Name
            </label>
            <input
              v-model="form.fullName"
              type="text"
              required
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>

          <!-- Email -->
          <div>
            <label class="block text-sm font-medium text-white mb-2">
              Email
            </label>
            <input
              v-model="form.email"
              type="email"
              required
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@company.com"
            />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-sm font-medium text-white mb-2">
              Password
            </label>
            <input
              v-model="form.password"
              type="password"
              required
              minlength="6"
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
            <p class="text-xs text-gray-500 mt-1">At least 6 characters</p>
          </div>

          <!-- Organization Name -->
          <div>
            <label class="block text-sm font-medium text-white mb-2">
              Organization Name
            </label>
            <input
              v-model="form.organizationName"
              type="text"
              required
              class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Acme Inc"
            />
            <p class="text-xs text-gray-500 mt-1">
              Your team or company name
            </p>
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
            {{ loading ? 'Creating account...' : 'Create account' }}
          </button>
        </form>

        <!-- Sign In Link -->
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-400">
            Already have an account?
            <NuxtLink to="/auth/login" class="text-blue-400 hover:text-blue-300">
              Sign in
            </NuxtLink>
          </p>
        </div>
      </div>

      <!-- Terms -->
      <p class="text-xs text-gray-500 text-center mt-6">
        By signing up, you agree to our
        <a href="#" class="text-gray-400 hover:text-gray-300">Terms of Service</a>
        and
        <a href="#" class="text-gray-400 hover:text-gray-300">Privacy Policy</a>
      </p>
    </div>
  </div>
</template>

