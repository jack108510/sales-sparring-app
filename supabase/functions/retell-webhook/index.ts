import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const event = body.event as string;
  if (event !== 'call_ended' && event !== 'call_analyzed') {
    return new Response('Ignored', { status: 200 });
  }

  const call = body.call as Record<string, unknown> | undefined;
  if (!call) {
    return new Response('No call data', { status: 400 });
  }

  const callId = call.call_id as string;
  const analysis = call.call_analysis as Record<string, unknown> | undefined;

  let score = 0;
  let feedbackJson: Record<string, unknown> | null = null;

  if (analysis) {
    const sentiment = (analysis.user_sentiment as string | undefined)?.toLowerCase();
    const successful = analysis.call_successful as boolean | undefined;
    const summary = analysis.call_summary as string | undefined;
    const custom = analysis.custom_analysis_data as Record<string, unknown> | undefined;

    if (custom?.score && typeof custom.score === 'number') {
      score = Math.min(100, Math.max(0, custom.score));
    } else {
      score = successful ? (sentiment === 'positive' ? 85 : sentiment === 'neutral' ? 70 : 55) : 40;
    }

    feedbackJson = {
      overall_summary: summary || 'Call completed.',
      strengths: (custom?.strengths as string[]) || deriveStrengths(successful, sentiment),
      areas_to_improve: (custom?.areas_to_improve as string[]) || deriveImprovements(successful, sentiment),
      talk_ratio: custom?.talk_ratio as number | undefined,
      objections_handled: custom?.objections_handled as number | undefined,
    };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { error } = await supabase
    .from('sparring_sessions')
    .update({ score, feedback_json: feedbackJson })
    .eq('retell_call_id', callId);

  if (error) {
    console.error('Supabase update error:', error);
    return new Response('DB error', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, callId, score }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

function deriveStrengths(successful: boolean | undefined, sentiment: string | undefined): string[] {
  if (successful) {
    return sentiment === 'positive'
      ? ['Strong rapport building', 'Clear value communication']
      : ['Persistent through objections', 'Maintained professionalism'];
  }
  return ['Completed the full call scenario'];
}

function deriveImprovements(successful: boolean | undefined, sentiment: string | undefined): string[] {
  if (!successful) {
    return ['Address buyer objections more directly', 'Establish pain points earlier in the call'];
  }
  return sentiment === 'positive'
    ? ['Ask for the close sooner']
    : ['Build more emotional connection with the buyer'];
}
