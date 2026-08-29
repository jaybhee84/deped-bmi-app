import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://xinkzertckylyiglqikh.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_7cGjEoD_WkrvQIafr-jRCQ_JmhDSUbS';

// Records belonging to this school are also mirrored to the original school
// Supabase by the server-side mirror function. Never place the destination
// service-role key in this client application.
export const SCHOOL_MIRROR_ID = '126001';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
