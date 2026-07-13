// Centralized configuration for backend service names and browser-safe URLs.
// Do NOT put secrets here — server-only secrets live in the edge functions'
// environment (see README.md "Configuration inventory").

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const EDGE_FUNCTIONS = {
  startWorkflow: "start-workflow",
} as const;
