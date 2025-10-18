// Middleware for pages that should only be accessible to guests (not logged in)
export default defineNuxtRouteMiddleware((to, from) => {
  const user = useSupabaseUser()

  if (user.value) {
    return navigateTo('/dashboard')
  }
})

