const rawEnv = import.meta.env;

function readEnv(name: string, fallback = ""): string {
  return String(rawEnv[name] ?? fallback).trim();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export const appConfig = {
  apiBaseUrl: stripTrailingSlash(readEnv("VITE_CHATMYDOCS_API_URL", "http://localhost:8000")),
  supabaseUrl: stripTrailingSlash(readEnv("VITE_SUPABASE_URL")),
  supabaseAnonKey: readEnv("VITE_SUPABASE_ANON_KEY"),
};

export const envStatus = {
  apiBaseUrl: Boolean(appConfig.apiBaseUrl),
  supabaseUrl: Boolean(appConfig.supabaseUrl),
  supabaseAnonKey: Boolean(appConfig.supabaseAnonKey),
};

export function requireBrowserEnv() {
  const missing = [
    ["VITE_SUPABASE_URL", envStatus.supabaseUrl],
    ["VITE_SUPABASE_ANON_KEY", envStatus.supabaseAnonKey],
    ["VITE_CHATMYDOCS_API_URL", envStatus.apiBaseUrl],
  ]
    .filter(([, configured]) => !configured)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing frontend environment variable(s): ${missing.join(", ")}`);
  }
}
