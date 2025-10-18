// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxtjs/supabase'],
  ssr: false,
  css: ['~/assets/css/main.css'],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ],
      htmlAttrs: {
        style: 'background:#000'
      },
      bodyAttrs: {
        style: 'background:#000;margin:0;padding:0'
      }
    }
  },
  runtimeConfig: {
    public: {
      daemonUrl: process.env.DAEMON_URL || 'http://127.0.0.1:3434'
    }
  },
  supabase: {
    redirect: false
  },
  compatibilityDate: '2024-04-03'
})

