import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Cliente Supabase para peticiones desde el browser */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseConfigError(): string | null {
  if (!supabaseUrl) return "Falta NEXT_PUBLIC_SUPABASE_URL en .env.local";
  if (!supabaseAnonKey) return "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local";
  return null;
}
