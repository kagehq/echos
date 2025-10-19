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
const success = ref(false)
const needsVerification = ref(false)

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
    // 1. Sign up the user with metadata
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.value.email,
      password: form.value.password,
      options: {
        data: {
          full_name: form.value.fullName,
          organization_name: form.value.organizationName,
          organization_slug: generateSlug(form.value.organizationName)
        }
      }
    })

    if (authError) throw authError
    if (!authData.user) throw new Error('No user returned from signup')

    // Check if email confirmation is required
    if (authData.session) {
      // User is auto-confirmed, proceed with setup immediately
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

      // Redirect to main dashboard
      await navigateTo('/')
    } else {
      // Email verification required - org will be created after verification
      needsVerification.value = true
      success.value = true
    }
  } catch (err: any) {
    console.error('Signup error:', err)
    
    // Provide human-friendly error messages
    if (err.message?.includes('User already registered')) {
      error.value = 'This email is already registered. Please sign in instead.'
    } else if (err.message?.includes('foreign key constraint')) {
      error.value = 'This email is already in use. Please sign in or use a different email.'
    } else if (err.message?.includes('duplicate key')) {
      error.value = 'An account with this email already exists. Please sign in.'
    } else if (err.message?.includes('Invalid email')) {
      error.value = 'Please enter a valid email address.'
    } else if (err.message?.includes('Password should be at least')) {
      error.value = 'Password must be at least 6 characters long.'
    } else {
      error.value = err.message || 'Failed to sign up. Please try again.'
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
        <h2 class="text-2xl font-semibold text-white mb-2">Create your account</h2>
        <p class="text-gray-400 text-sm">Start monitoring your AI agents</p>
      </div>

      <!-- Success Message (Email Verification Needed) -->
      <div v-if="success && needsVerification" class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
        <div class="text-center">
          <div class="mb-4">
            <svg class="w-10 h-10 mx-auto text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-white mb-2">Check Your Email</h3>
          <p class="text-gray-400 text-sm mb-6">
            We've sent a verification link to <span class="text-white font-medium">{{ form.email }}</span>.
            Click the link to verify your account and complete setup.
          </p>
          
          <!-- Tips -->
          <div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6 text-left">
            <p class="text-sm text-blue-300 font-medium mb-2">Didn't receive the email?</p>
            <ul class="text-xs text-gray-400 space-y-1 ml-4">
              <li>• Check your spam/junk folder</li>
              <li>• Make sure you entered the correct email</li>
              <li>• Wait a few minutes for the email to arrive</li>
            </ul>
          </div>

          <NuxtLink 
            to="/verify-email"
            class="inline-block w-full bg-blue-300 hover:bg-blue-400 text-black font-medium py-2.5 rounded-lg transition-colors text-sm text-center"
          >
            Resend Verification Email
          </NuxtLink>
        </div>
      </div>

      <!-- Signup Form -->
      <div v-else class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
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
              :disabled="loading"
              class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
              :disabled="loading"
              class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
              :disabled="loading"
              class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
            <p class="text-xs text-gray-400 mt-1">At least 6 characters</p>
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
              :disabled="loading"
              class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Acme Inc"
            />
            <p class="text-xs text-gray-400 mt-1">
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
            class="w-full bg-blue-300 hover:bg-blue-400 disabled:bg-blue-300/50 disabled:cursor-not-allowed text-black font-medium py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center space-x-2"
          >
            <span v-if="loading" class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-black"></span>
            <span>{{ loading ? 'Creating account...' : 'Create account' }}</span>
          </button>
        </form>

        <!-- Sign In Link -->
        <div class="mt-6 text-center">
          <p class="text-sm text-gray-400">
            Already have an account?
            <NuxtLink to="/login" class="text-blue-400 hover:text-blue-300">
              Sign in
            </NuxtLink>
          </p>
        </div>
      </div>

      <!-- Terms -->
      <p class="text-xs text-gray-500 text-center mt-6">
        By signing up, you agree to our
        <a href="#" class="text-gray-400 hover:text-gray-300">Terms</a>
        and
        <a href="#" class="text-gray-400 hover:text-gray-300">Privacy</a>
      </p>
    </div>
  </div>
</template>

