// Middleware for protected routes that require authentication
export default defineNuxtRouteMiddleware(async (to, from) => {
  const supabase = useSupabaseClient()

  // Wait for Supabase to initialize and load the session
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session?.user) {
    return navigateTo('/login')
  }

  // Verify the user actually exists in the database
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .single()

    // If profile doesn't exist or there's an error, sign out and redirect
    if (error || !profile) {
      await supabase.auth.signOut()
      return navigateTo('/login')
    }
  } catch (err) {
    // On any error, sign out for safety
    await supabase.auth.signOut()
    return navigateTo('/login')
  }
})
