// Middleware for protected routes that require authentication
export default defineNuxtRouteMiddleware(async (to, from) => {
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()

  // Wait for Supabase to initialize and load the session
  if (!user.value) {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return navigateTo('/login')
    }
  }
})
