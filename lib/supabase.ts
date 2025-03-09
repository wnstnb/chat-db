import { createClient } from '@supabase/supabase-js';

// Create a Supabase client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Database types
export type Conversation = {
  id: number;
  title: string;
  conversation: string; // JSON stored as string
  created_at: string;
};

export type ChatCallInfo = {
  id: number;
  conversation_id: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model_version: string;
  query_type: 'READ' | 'WRITE';
  execution_time: number;
  status: string;
  error_message: string | null;
  created_at: string;
}; 