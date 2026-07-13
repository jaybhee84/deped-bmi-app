import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://usbqwedfhmceasrepjnb.supabase.co';
const supabaseAnonKey = 'sb_publishable_SsMtcj2eu7PZnSRg3geAXQ_X425usO5';

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);