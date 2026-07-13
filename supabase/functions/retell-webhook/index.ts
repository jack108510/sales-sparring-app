import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const event = body.event as string;
  if (event !== 'call_ended' && event !== 'call_analyzed') return new Response('Ignored', { status: 200 });

  const call = body.call as Record<string, unknown> | undefined;
  if (!call) return new Response('No call data', { status: 400 });

  const callId = call.call_id as string;
  const analysis = call.call_analysis as Record<string, unknown> | undefined;
  const transcript = call.transcript as string | undefined;

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

    const scoreBreakdown = custom?.score_breakdown || deriveScoreBreakdown(score, successful, sentiment);
    const talkRatio = custom?.talk_ratio ?? estimateTalkRatio(transcript);
    const fillerCount = custom?.filler_count ?? countFillerWords(transcript);
    const questionCount = custom?.question_count ?? countQuestions(transcript);

    feedbackJson = {
      overall_summary: summary || 'Call completed.',
      strengths: (custom?.strengths as string[]) || deriveStrengths(successful, sentiment),
      areas_to_improve: (custom?.areas_to_improve as string[]) || deriveImprovements(successful, sentiment),
      one_fix: (custom?.one_fix as string) || deriveOneFix(successful, sentiment, score),
      talk_ratio: talkRatio,
      filler_count: fillerCount,
      question_count: questionCount,
      objections_handled: custom?.objections_handled,
      score_breakdown: scoreBreakdown,
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

function deriveScoreBreakdown(
  score: number,
  successful: boolean | undefined,
  sentiment: string | undefined
): Record<string, number> {
  const v = () => Math.round((Math.random() - 0.5) * 20);
  return {
    rapport: Math.min(100, Math.max(0, score + (sentiment === 'positive' ? 10 : -5) + v())),
    discovery: Math.min(100, Math.max(0, score + v())),
    handling: Math.min(100, Math.max(0, score + (successful ? 5 : -10) + v())),
    closing: Math.min(100, Math.max(0, score + (successful ? 15 : -15) + v())),
  };
}

function estimateTalkRatio(transcript: string | undefined): number {
  if (!transcript) return 55;
  const lines = transcript.split('\n').filter(l => l.trim());
  if (lines.length === 0) return 55;
  const agentLines = lines.filter(l => /^(agent|rep):/i.test(l));
  return Math.round((agentLines.length / lines.length) * 100);
}

function countFillerWords(transcript: string | undefined): number {
  if (!transcript) return 0;
  const fillers = /\b(um|uh|like|you know|so|actually|basically|literally|right\?|you see)\b/gi;
  return (transcript.match(fillers) || []).length;
}

function countQuestions(transcript: string | undefined): number {
  if (!transcript) return 0;
  const agentText = transcript
    .split('\n')
    .filter(l => /^(agent|rep):/i.test(l))
    .join(' ');
  return (agentText.match(/\?/g) || []).length;
}

function deriveStrengths(successful: boolean | undefined, sentiment: string | undefined): string[] {
  if (successful) {
    return sentiment === 'positive'
      ? ['Strong rapport from the start', 'Communicated value clearly']
      : ['Stayed persistent under pushback', 'Maintained a professional tone'];
  }
  return ['Completed the full call'];
}

function deriveImprovements(successful: boolean | undefined, sentiment: string | undefined): string[] {
  if (!successful) return ['Handle objections more directly', 'Surface buyer pain earlier'];
  return sentiment === 'positive' ? ['Ask for the close sooner'] : ['Build more personal connection'];
}

function deriveOneFix(successful: boolean | undefined, sentiment: string | undefined, score: number): string {
  if (score >= 80) return 'Solid call. Push yourself to get the close in fewer exchanges next time.';
  if (!successful) return 'Get the buyer talking about their pain before you pitch anything.';
  if (sentiment === 'negative') return "Mirror the buyer's language — it builds trust faster than selling at them.";
  return 'Ask for a concrete next step before the call ends, even if it feels early.';
}
