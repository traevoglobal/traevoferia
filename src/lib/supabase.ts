import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);
export const SUPABASE_URL = url ?? '';
export const SUPABASE_ANON_KEY = key ?? '';

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'traevo-feria-auth' },
});

let myId: string | null = null;
export const getMyId = () => myId;
export const setMyId = (id: string | null) => {
  myId = id;
};
