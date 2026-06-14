import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dummy_key';

export const isMock = supabaseUrl === 'https://dummy.supabase.co';
if (isMock) {
  console.error("Missing Supabase environment variables! Using dummy values, database calls will fail.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
