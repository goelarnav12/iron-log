import { createClient } from '@supabase/supabase-js';

// Vite inlines these at build time. The publishable key is public by design —
// row level security in schema.sql is what actually protects the data.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until .env.local is filled in; App shows a setup panel instead. */
export const isConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT'));

export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  key ?? 'placeholder',
);
