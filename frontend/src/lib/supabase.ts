import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Supabase client. Empty url/key in SSR or missing env – use getSession etc. only in browser when logged in. */
export const supabase: SupabaseClient = createClient(url, anonKey);
