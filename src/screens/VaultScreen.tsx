import React, { useEffect, useState, useCallback } from 'react';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList, SparringSession, BuyerPersona } from '../types';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Vault'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const PERSONA_LABELS: Record<BuyerPersona, string> = {
  skeptic: 'The Skeptic',
  rusher: 'The Rusher',
  price_hunter: 'Price Hunter',
  indifferent: 'The Indifferent',
  executive: 'The Executive',
  champion: 'The Champion',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function scoreColor(score: number) {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#f0a500';
  if (score > 0) return '#ef4444';
  return '#555';
}

function difficultyLabel(d?: string) {
  if (d === 'warm') return '🟢 Warm';
  if (d === 'cold') return '🔵 Cold';
  if (d === 'ice_cold') return '❄️ Ice Cold';
  return null;
}

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const W = 280, H = 56;
  const PAD = 6;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const pts = scores.map((s, i) => {
    const x = PAD + (i / (scores.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (s - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastPt = pts[pts.length - 1].split(',');
  const lastX = parseFloat(lastPt[0]);
  const lastY = parseFloat(lastPt[1]);

  return (
    <View style={spark.container}>
      <View style={spark.headerRow}>
        <Text style={spark.label}>Last {scores.length} calls</Text>
        <Text style={spark.range}>{min} → {max}</Text>
      </View>
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#6c63ff" stopOpacity="1" />
            <Stop offset="1" stopColor="#4ade80" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Polyline
          points={pts.join(' ')}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {scores.map((s, i) => {
          const x = PAD + (i / (scores.length - 1)) * (W - PAD * 2);
          const y = PAD + (1 - (s - min) / range) * (H - PAD * 2);
          const isLast = i === scores.length - 1;
          return (
            <Circle
              key={i}
              cx={x}
              cy={y}
              r={isLast ? 5 : 3}
              fill={isLast ? '#4ade80' : '#6c63ff'}
              opacity={isLast ? 1 : 0.6}
            />
          );
        })}
      </Svg>
    </View>
  );
}

export default function VaultScreen({ navigation }: Props) {
  const [sessions, setSessions] = useState<SparringSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [])
  );

  async function loadSessions() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('sparring_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setSessions(data);
      setStreak(computeStreak(data));
    }
    setLoading(false);
    setRefreshing(false);
  }

  function computeStreak(data: SparringSession[]): number {
    // streak = consecutive days with at least one call
    const days = new Set(data.map(s => s.created_at.slice(0, 10)));
    const sorted = Array.from(days).sort().reverse();
    const today = new Date().toISOString().slice(0, 10);
    let count = 0;
    let cur = today;
    for (const day of sorted) {
      if (day === cur) {
        count++;
        const d = new Date(cur);
        d.setDate(d.getDate() - 1);
        cur = d.toISOString().slice(0, 10);
      } else break;
    }
    return count;
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadSessions();
  }

  const scoredSessions = sessions.filter(s => s.score > 0);
  const sparkScores = scoredSessions.slice(0, 10).reverse().map(s => s.score);
  const avgScore = scoredSessions.length > 0
    ? Math.round(scoredSessions.reduce((sum, s) => sum + s.score, 0) / scoredSessions.length)
    : 0;
  const best = scoredSessions.length > 0 ? Math.max(...scoredSessions.map(s => s.score)) : 0;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={sessions}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6c63ff" />}
      ListHeaderComponent={() => (
        <>
          <Text style={styles.title}>Vault</Text>
          <Text style={styles.subtitle}>Your call history</Text>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{sessions.length}</Text>
              <Text style={styles.statLabel}>Calls</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: scoreColor(avgScore) }]}>{avgScore || '—'}</Text>
              <Text style={styles.statLabel}>Avg Score</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#4ade80' }]}>{best || '—'}</Text>
              <Text style={styles.statLabel}>Best</Text>
            </View>
            {streak > 0 && (
              <View style={[styles.statCard, { borderColor: '#f0a50044' }]}>
                <Text style={[styles.statValue, { color: '#f0a500' }]}>{streak}🔥</Text>
                <Text style={styles.statLabel}>Streak</Text>
              </View>
            )}
          </View>

          {sparkScores.length >= 2 && <Sparkline scores={sparkScores} />}

          {sessions.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No calls yet. Start your first spar.</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => navigation.navigate('VoiceCall', {})}
              >
                <Text style={styles.emptyButtonText}>Start a Call</Text>
              </TouchableOpacity>
            </View>
          )}

          {sessions.length > 0 && <Text style={styles.listHeader}>All Calls</Text>}
        </>
      )}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.sessionCard}
          onPress={() => navigation.navigate('CallResults', { sessionId: item.id })}
        >
          <View style={styles.sessionLeft}>
            <Text style={styles.sessionDate}>{formatDate(item.created_at)}</Text>
            <View style={styles.sessionMeta}>
              {item.buyer_persona && (
                <Text style={styles.metaChip}>{PERSONA_LABELS[item.buyer_persona]}</Text>
              )}
              {item.difficulty && (
                <Text style={styles.metaChip}>{difficultyLabel(item.difficulty)}</Text>
              )}
            </View>
            <Text style={styles.sessionDuration}>{formatDuration(item.duration_seconds)}</Text>
          </View>
          <View style={styles.sessionRight}>
            <Text style={[styles.sessionScore, { color: scoreColor(item.score) }]}>
              {item.score > 0 ? item.score : '—'}
            </Text>
            {item.score === 0 && <Text style={styles.pendingTag}>scoring</Text>}
          </View>
        </TouchableOpacity>
      )}
      ListFooterComponent={<View style={{ height: 40 }} />}
    />
  );
}

const spark = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 12, color: '#666', fontWeight: '600' },
  range: { fontSize: 11, color: '#555' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingBottom: 60 },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 16, marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 20 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  statCard: {
    flex: 1,
    minWidth: 70,
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: '#6c63ff' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 3 },

  listHeader: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },

  sessionCard: {
    flexDirection: 'row',
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    alignItems: 'center',
  },
  sessionLeft: { flex: 1 },
  sessionDate: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 },
  sessionMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  metaChip: { fontSize: 11, color: '#888', backgroundColor: '#2a2a3e', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  sessionDuration: { fontSize: 12, color: '#666' },
  sessionRight: { alignItems: 'flex-end' },
  sessionScore: { fontSize: 28, fontWeight: '900' },
  pendingTag: { fontSize: 10, color: '#6c63ff', marginTop: 2 },

  emptyCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 20,
  },
  emptyText: { fontSize: 14, color: '#888', marginBottom: 16, textAlign: 'center' },
  emptyButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
