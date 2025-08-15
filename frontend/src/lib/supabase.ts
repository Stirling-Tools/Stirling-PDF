import { createClient } from '@supabase/supabase-js'

// Debug helper to log Supabase configuration
const debugConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
  
  console.log('[Supabase Debug] Configuration:', {
    url: url ? '✓ URL configured' : '✗ URL missing',
    key: key ? '✓ Key configured' : '✗ Key missing',
    urlValue: url || 'undefined',
    keyValue: key ? `${key.substring(0, 20)}...` : 'undefined'
  })
  
  return { url, key }
}

const config = debugConfig()

if (!config.url) {
  throw new Error('Missing VITE_SUPABASE_URL environment variable')
}

if (!config.key) {
  throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY environment variable')
}

export const supabase = createClient(
  config.url,
  config.key,
  {
    auth: {
      persistSession: true, // keep session in localStorage
      autoRefreshToken: true,
      detectSessionInUrl: true, // helpful on first load after redirect
      debug: import.meta.env.DEV, // Enable debug logs in development
    },
  }
)

// Debug helper for auth events
export const debugAuthEvents = () => {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase Debug] Auth state change:', {
      event,
      hasSession: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
      provider: session?.user?.app_metadata?.provider,
      timestamp: new Date().toISOString()
    })
  })
}

// Call this in development to enable auth debugging
if (import.meta.env.DEV) {
  debugAuthEvents()
}