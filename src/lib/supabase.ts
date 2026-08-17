import { createClient } from '@supabase/supabase-js';

// User provided Supabase project credentials
const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};

export const SUPABASE_URL = 
  metaEnv.VITE_SUPABASE_URL || 
  'https://ctontqqcwqtsfkhxpjcu.supabase.co';

export const SUPABASE_ANON_KEY = 
  metaEnv.VITE_SUPABASE_ANON_KEY || 
  'sb_publishable_7UYU-TxrIVcTZWcIRLY1Vw_IkcL9bFr';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

