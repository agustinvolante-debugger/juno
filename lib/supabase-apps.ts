import { createClient } from '@supabase/supabase-js'

// The "juno-apps" Supabase project: VC Constellation (vc_*) and Daily Brief (news_*).
// Juno Pen and site analytics stay on lib/supabase.ts. Split 8 Oct 2026 to free the Pen project's space.
// Never throws at import: a missing env var must not break the build (and with it, Pen).
const url = process.env.APPS_SUPABASE_URL
const key = process.env.APPS_SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) console.error('supabase-apps: APPS_SUPABASE_URL / APPS_SUPABASE_SERVICE_ROLE_KEY not set')

// Service role client for server-side operations (bypasses RLS)
export const appsAdmin = createClient(url || 'https://apps-env-missing.invalid', key || 'missing')
