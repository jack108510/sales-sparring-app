import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  // Verify user JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return new Response('Unauthorized', { status: 401, headers: CORS });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return new Response('Unauthorized', { status: 401, headers: CORS });

  let body: any;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400, headers: CORS }); }

  const { messages, model = 'gpt-4o', temperature = 0.3, max_tokens = 3000 } = body;
  if (!messages) return new Response('Missing messages', { status: 400, headers: CORS });

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_API_KEY },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: resp.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
