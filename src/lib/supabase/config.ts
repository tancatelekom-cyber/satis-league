const DEFAULT_APP_URL = "https://satis-league-git-main-tancatelekom-8777s-projects.vercel.app";
const DEFAULT_SUPABASE_URL = "https://hcujngemymgviwwauplz.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_E8xQ7d_OqNmbffT7d2p9_A_d-OfAqQi";

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured() {
  return Boolean(getSupabasePublicEnv());
}

export function getSupabaseAdminEnv() {
  const publicEnv = getSupabasePublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!publicEnv || !serviceRoleKey) {
    return null;
  }

  return {
    url: publicEnv.url,
    serviceRoleKey
  };
}

export function isSupabaseAdminConfigured() {
  return Boolean(getSupabaseAdminEnv());
}

export function getAppBaseUrl() {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredAppUrl) {
    return configuredAppUrl.replace(/\/$/, "");
  }

  return DEFAULT_APP_URL;
}
