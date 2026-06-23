import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl =
  (Constants.expoConfig?.extra?.supabaseUrl as string) ||
  'https://xacehhtgvubcqdoltazg.supabase.co';

const supabaseAnonKey =
  (Constants.expoConfig?.extra?.supabaseAnonKey as string) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhY2VoaHRndnViY3Fkb2x0YXpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDI4NjcsImV4cCI6MjA4OTUxODg2N30.cHCCtXwtl8BW2G2yB8WJqfFeUNCzFwDNd2jDGvyWYew';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
