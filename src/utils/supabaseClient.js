import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://joilvslvsioayrjshuxg.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_aozkBamT5C58KY03X9kUgA_iehy73ZU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
