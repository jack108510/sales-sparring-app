import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, SparringSession, BuyerPersona, ScoreBreakdown } from '../types';
import { supabase } from '../lib/supabase';

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 15;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CallResults'>;
  route: RouteProp<RootStackParamList, 'CallResults'>;
};

const PERSONA_LABELS: Record<BuyerPersona, string> = {
  skeptic: 'The Skeptic',
  rusher: 'The Rusher',
  price_hunter: 'Price Hunter',
  indifferent: 'The Indifferent',
  executive: 'The Executive',
  champion: 'The Champion',
};

function scoreColor(score: number) {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#f0a500';
  if (score > 0) return '#ef4444';
  return '#555';
}

function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score);
  const label = score >= 80 ? 'Excellent' : score >= 70 ? 'Strong' : score >= 60 ? 'Solid' : score > 0 ? 'Needs Work' : 'Pending';
  return (
    <View style={[ring.container, { borderColor: color }]}>
      <Text style={[ring.number, { color }]}>{score > 0 ? score : '—'}</Text>
      <Text style={[ring.label, { color }]}>{label}</Text>
    </View>
  );
}

function BreakdownBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={bar.row}>
      <Text style={bar.label}>{label}</Text>
      <View style={bar.track}>
        <View style={[bar.fill, { width: `${value}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[bar.value, { color }]}>{value}</Text>
    </View>
  );
}

function TalkRatioBar({ ratio }: { ratio: number }) {
  const repPct = Math.round(ratio);
  const buyerPct = 100 - repPct;
  const repColor = repPct > 65 ? '#ef4444' : repPct > 45 ? '#4ade80' : '#f0a500';
  return (
    <View style={talk.container}>
      <Text style={talk.title}>Talk ratio</Text>
      <View style={talk.bar}>
        <View style={[talk.repFill, { flex: repPct, backgroundColor: repColor }]} />
        <View style={[talk.buyerFill, { flex: buyerPct }]} />
      </View>
      <View style={talk.labels}>
        <Text style={[talk.repLabel, { color: repColor }]}>You {repPct}%</Text>
        <Text style={talk.buyerLabel}>Buyer {buyerPct}%</Text>
      </View>
      {repPct > 65 && (
        <Text style={talk.warning}>You talked too much. Let the buyer lead.</Text>
      )}
    </View>
  );
}

export default function CallResultsScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<SparringSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [waitingForScore, setWaitingForScore] = useState(false);
  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualRetrying, setManualRetrying] = useState(false);

  useEffect(() => {
    loadSession();
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [sessionId]);

  async function loadSession() {
    const { data } = await supabase.from('sparring_sessions').select('*').eq('id', sessionId).single();
    setSession(data);
    setLoading(false);
    if (data && data.score === 0 && !data.feedback_json) {
      setWaitingForScore(true);
      schedulePoll();
    }
  }

  function schedulePoll() {
    if (pollCount.current >= MAX_POLLS) { setWaitingForScore(false); return; }
    pollTimer.current = setTimeout(async () => {
      pollCount.current += 1;
      const { data } = await supabase.from('sparring_sessions').select('*').eq('id', sessionId).single();
      if (data) {
        setSession(data);
        if (data.score > 0 || data.feedback_json) setWaitingForScore(false);
        else schedulePoll();
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleRetryScoring() {
    setManualRetrying(true);
    pollCount.current = 0;
    const { data } = await supabase.from('sparring_sessions').select('*').eq('id', sessionId).single();
    if (data) {
      setSession(data);
      if (data.score > 0 || data.feedback_json) {
        setManualRetrying(false);
        return;
      }
    }
    setWaitingForScore(true);
    schedulePoll();
    setManualRetrying(false);
  }

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  }
  if (!session) {
    return <View style={[styles.container, styles.center]}><Text style={styles.errorText}>Session not found</Text></View>;
  }

  const feedback = session.feedback_json;
  const durationMin = Math.floor(session.duration_seconds / 60);
  const durationSec = session.duration_seconds % 60;
  const bd = feedback?.score_breakdown as ScoreBreakdown | undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Breakdown</Text>
      <Text style={styles.dateText}>
        {new Date(session.created_at).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
      </Text>

      {(session.buyer_persona || session.difficulty) && (
        <View style={styles.tagsRow}>
          {session.buyer_persona && (
            <View style={styles.tag}><Text style={styles.tagText}>{PERSONA_LABELS[session.buyer_persona]}</Text></View>
          )}
          {session.difficulty && (
            <View style={styles.tag}><Text style={styles.tagText}>{difficultyLabel(session.difficulty)}</Text></View>
          )}
          <View style={styles.tag}>
            <Text style={styles.tagText}>{durationMin > 0 ? `${durationMin}m ` : ''}{durationSec}s</Text>
          </View>
        </View>
      )}

      <View style={styles.scoreSection}>
        <ScoreRing score={session.score} />
        {waitingForScore && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color="#6c63ff" />
            <Text style={styles.processingText}>Scoring your call…</Text>
          </View>
        )}
      </View>

      {feedback?.one_fix && (
        <View style={styles.oneFix}>
          <Text style={styles.oneFixLabel}>ONE THING TO FIX</Text>
          <Text style={styles.oneFixText}>{feedback.one_fix}</Text>
        </View>
      )}

      {bd && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Score breakdown</Text>
          <BreakdownBar label="Rapport" value={bd.rapport} color={scoreColor(bd.rapport)} />
          <BreakdownBar label="Discovery" value={bd.discovery} color={scoreColor(bd.discovery)} />
          <BreakdownBar label="Handling" value={bd.handling} color={scoreColor(bd.handling)} />
          <BreakdownBar label="Closing" value={bd.closing} color={scoreColor(bd.closing)} />
        </View>
      )}

      {feedback?.talk_ratio != null && <TalkRatioBar ratio={feedback.talk_ratio} />}

      {(feedback?.filler_count != null || feedback?.question_count != null) && (
        <View style={styles.statsRow}>
          {feedback?.question_count != null && (
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: (feedback.question_count ?? 0) >= 3 ? '#4ade80' : '#f0a500' }]}>
                {feedback.question_count}
              </Text>
              <Text style={styles.statLabel}>Questions asked</Text>
            </View>
          )}
          {feedback?.filler_count != null && (
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: (feedback.filler_count ?? 0) <= 3 ? '#4ade80' : (feedback.filler_count ?? 0) <= 8 ? '#f0a500' : '#ef4444' }]}>
                {feedback.filler_count}
              </Text>
              <Text style={styles.statLabel}>Filler words</Text>
            </View>
          )}
          {feedback?.objections_handled != null && (
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#60a5fa' }]}>{feedback.objections_handled}</Text>
              <Text style={styles.statLabel}>Objections handled</Text>
            </View>
          )}
        </View>
      )}

      {feedback && (
        <>
          {feedback.overall_summary && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Summary</Text>
              <Text style={styles.cardBody}>{feedback.overall_summary}</Text>
            </View>
          )}
          {feedback.strengths && feedback.strengths.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>What worked</Text>
              {feedback.strengths.map((s, i) => (
                <Text key={i} style={styles.listItem}>✓ {s}</Text>
              ))}
            </View>
          )}
          {feedback.areas_to_improve && feedback.areas_to_improve.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Where to improve</Text>
              {feedback.areas_to_improve.map((a, i) => (
                <Text key={i} style={styles.listItem}>→ {a}</Text>
              ))}
            </View>
          )}
        </>
      )}

      {!feedback && !waitingForScore && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Feedback Pending</Text>
          <Text style={styles.cardBody}>Scoring takes a moment after the call ends. Tap below to check again.</Text>
          <TouchableOpacity
            style={[styles.retryButton, { marginTop: 14 }, manualRetrying && { opacity: 0.5 }]}
            onPress={handleRetryScoring}
            disabled={manualRetrying}
          >
            <Text style={styles.retryButtonText}>{manualRetrying ? 'Checking…' : 'Check for score'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actions}>
        {session.buyer_persona && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => navigation.replace('VoiceCall', {
              setup: { persona: session.buyer_persona!, difficulty: session.difficulty ?? 'cold' }
            })}
          >
            <Text style={styles.retryButtonText}>Retry same buyer</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.doneButton} onPress={() => navigation.navigate('Main')}>
          <Text style={styles.doneButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function difficultyLabel(d: string): string {
  if (d === 'warm') return '🟢 Warm';
  if (d === 'cold') return '🔵 Cold';
  if (d === 'ice_cold') return '❄️ Ice Cold';
  return d;
}

const ring = StyleSheet.create({
  container: { width: 150, height: 150, borderRadius: 75, borderWidth: 7, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 46, fontWeight: '900' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 2 },
});

const bar = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 13, color: '#aaa', width: 80 },
  track: { flex: 1, height: 6, backgroundColor: '#2a2a3e', borderRadius: 3, overflow: 'hidden', marginHorizontal: 10 },
  fill: { height: '100%', borderRadius: 3 },
  value: { fontSize: 13, fontWeight: '700', width: 28, textAlign: 'right' },
});

const talk = StyleSheet.create({
  container: { backgroundColor: '#1e1e2e', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#2a2a3e' },
  title: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 10 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  repFill: { borderRadius: 5 },
  buyerFill: { backgroundColor: '#2a2a3e', borderRadius: 5 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  repLabel: { fontSize: 12, fontWeight: '700' },
  buyerLabel: { fontSize: 12, color: '#666' },
  warning: { fontSize: 12, color: '#ef4444', marginTop: 8 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingBottom: 60 },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 16, marginBottom: 4 },
  dateText: { fontSize: 14, color: '#888', marginBottom: 14 },
  tagsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 20 },
  tag: { backgroundColor: '#1e1e2e', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderColor: '#2a2a3e' },
  tagText: { fontSize: 12, color: '#aaa', fontWeight: '500' },
  scoreSection: { alignItems: 'center', marginBottom: 24 },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  processingText: { color: '#6c63ff', fontSize: 13 },
  oneFix: { backgroundColor: '#1a1030', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#6c63ff55' },
  oneFixLabel: { fontSize: 10, fontWeight: '800', color: '#6c63ff', letterSpacing: 1.5, marginBottom: 8 },
  oneFixText: { fontSize: 16, color: '#fff', lineHeight: 24, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3e' },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 3, textAlign: 'center' },
  card: { backgroundColor: '#1e1e2e', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#2a2a3e' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 14 },
  cardBody: { fontSize: 14, color: '#aaa', lineHeight: 22 },
  listItem: { fontSize: 14, color: '#aaa', marginBottom: 8, lineHeight: 21 },
  errorText: { color: '#888', fontSize: 16 },
  actions: { gap: 10, marginTop: 8 },
  retryButton: { backgroundColor: '#1e1e2e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#6c63ff66' },
  retryButtonText: { color: '#a78bfa', fontWeight: '700', fontSize: 15 },
  doneButton: { backgroundColor: '#6c63ff', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
