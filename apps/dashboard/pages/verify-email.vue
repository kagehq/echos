<script setup lang="ts">
import { ref, onMounted } from 'vue'

definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

useHead({
  title: 'Verify Email - Echos',
})

const supabase = useSupabaseClient()
const route = useRoute()
const loading = ref(true)
const verificationStatus = ref<'pending' | 'success' | 'error' | 'already_verified'>('pending')
const error = ref('')
const email = ref('')

onMounted(async () => {
  // Check if this is a verification callback
  const token_hash = route.query.token_hash as string
  const type = route.query.type as string

  if (token_hash && type === 'email') {
    try {
      // Verify the email using the token
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash,
        type: 'email'
      })

      if (verifyError) {
        if (verifyError.message?.includes('already been verified')) {
          verificationStatus.value = 'already_verified'
        } else {
          throw verifyError
        }
      } else if (data.user) {
        verificationStatus.value = 'success'
        email.value = data.user.email || ''
        
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          navigateTo('/')
        }, 3000)
      }
    } catch (err: any) {
      console.error('Verification error:', err)
      verificationStatus.value = 'error'
      error.value = err.message || 'Failed to verify email'
    }
  } else {
    // No verification token, show instructions
    verificationStatus.value = 'pending'
  }
  
  loading.value = false
})

const resendVerification = async () => {
  if (!email.value) {
    error.value = 'Please enter your email address'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.value
    })

    if (resendError) throw resendError

    verificationStatus.value = 'pending'
    error.value = ''
  } catch (err: any) {
    console.error('Resend error:', err)
    error.value = err.message || 'Failed to resend verification email'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-black flex items-center justify-center px-4">
    <div class="max-w-md w-full">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="mb-0">
          <img src="~/assets/img/logo.png" alt="Echos" class="w-14 h-14 mx-auto">
        </div>
      </div>

      <!-- Verification Card -->
      <div class="bg-gray-500/5 border border-gray-500/20 rounded-lg p-8">
        <!-- Loading State -->
        <div v-if="loading" class="text-center">
          <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mb-4"></div>
          <p class="text-gray-400 text-sm">Verifying your email...</p>
        </div>

        <!-- Success State -->
        <div v-else-if="verificationStatus === 'success'" class="text-center">
          <div class="mb-4">
            <svg class="w-10 h-1 mx-auto text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-white mb-2">Email Verified!</h2>
          <p class="text-gray-400 text-sm mb-6">
            Your email has been successfully verified. Redirecting to dashboard...
          </p>
          <div class="flex items-center justify-center space-x-2 text-blue-400">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
            <span class="text-sm">Redirecting...</span>
          </div>
        </div>

        <!-- Already Verified State -->
        <div v-else-if="verificationStatus === 'already_verified'" class="text-center">
          <div class="mb-4">
            <svg class="w-10 h-10 mx-auto text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-white mb-2">Already Verified</h2>
          <p class="text-gray-400 text-sm mb-6">
            Your email has already been verified. You can sign in now.
          </p>
          <NuxtLink 
            to="/login" 
            class="inline-block w-full bg-blue-300 hover:bg-blue-400 text-black font-medium py-2.5 rounded-lg transition-colors text-sm text-center"
          >
            Sign In
          </NuxtLink>
        </div>

        <!-- Error State -->
        <div v-else-if="verificationStatus === 'error'" class="text-center">
          <div class="mb-4">
            <svg class="w-10 h-10 mx-auto text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-white mb-2">Verification Failed</h2>
          <p class="text-gray-400 text-sm mb-6">
            {{ error || 'The verification link may have expired or is invalid.' }}
          </p>
          
          <!-- Resend Form -->
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-white mb-2">
                Email Address
              </label>
              <input
                v-model="email"
                type="email"
                required
                class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20"
                placeholder="you@company.com"
              />
            </div>
            
            <button
              @click="resendVerification"
              :disabled="loading"
              class="w-full bg-blue-300 hover:bg-blue-400 disabled:bg-blue-300/50 text-black font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {{ loading ? 'Sending...' : 'Resend Verification Email' }}
            </button>
          </div>
        </div>

        <!-- Pending State (No token in URL) -->
        <div v-else class="text-center">
          <div class="mb-4">
            <svg class="w-16 h-16 mx-auto text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-white mb-2">Check Your Email</h2>
          <p class="text-gray-400 text-sm mb-6">
            We've sent a verification link to your email address. Click the link in the email to verify your account.
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

          <!-- Resend Form -->
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-white mb-2">
                Email Address
              </label>
              <input
                v-model="email"
                type="email"
                required
                class="w-full bg-gray-500/10 border border-gray-500/20 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/20"
                placeholder="you@company.com"
              />
            </div>
            
            <button
              @click="resendVerification"
              :disabled="loading"
              class="w-full bg-gray-500/20 hover:bg-gray-500/30 disabled:bg-gray-500/10 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              {{ loading ? 'Sending...' : 'Resend Verification Email' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Back to Login -->
      <div class="mt-6 text-center">
        <NuxtLink to="/login" class="text-sm text-gray-400 hover:text-gray-300">
          ← Back to login
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

