// Centralized configuration for backend service names and browser-safe URLs.
// Do NOT put worker URLs, tokens, or any secret here — server-only secrets
// (WORKER_URL, WORKER_TOKEN) live in the edge function's environment.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const EDGE_FUNCTIONS = {
  startWorkflow: "start-workflow",
} as const;