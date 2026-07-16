import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Browser auth client (anon key). Use only after env is set; on server, `url`/`anonKey` may be empty.
 * Session reads (`getSession`, `onAuthStateChange`) belong in client components or effects.
 */
export const supabase: SupabaseClient = createClient(url, anonKey);
