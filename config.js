// Public Supabase web config (safe to ship — the anon key is meant for
// browsers; data access is controlled by row-level-security policies).
// Fill these from Supabase Dashboard → Project Settings → API.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";

export function isCloudConfigured() {
  return Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_URL.startsWith("https://")
  );
}
