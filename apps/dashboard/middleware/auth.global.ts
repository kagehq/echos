export default defineNuxtRouteMiddleware(async (to, from) => {
  const user = useSupabaseUser()

  // Public routes that don't require auth
  const publicRoutes = ['/auth/login', '/auth/signup', '/auth/forgot-password']
  const isPublicRoute = publicRoutes.includes(to.path)

  // If user is not authenticated and trying to access protected route
  if (!user.value && !isPublicRoute) {
    return navigateTo('/auth/login')
  }

  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (user.value && isPublicRoute) {
    return navigateTo('/dashboard')
  }
})

