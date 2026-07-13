import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, TabParamList, SparringSession, BuyerPersona } from '../types';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Spar'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const DAILY_CHALLENGES: { persona: BuyerPersona; difficulty: 'warm' | 'cold' | 'ice_cold'; label: string; desc: string }[] = [
  { persona: 'price_hunter', difficulty: 'cold', label: 'Hold the line', desc: 'Close a price-obsessed buyer without dropping your number.' },
  { persona: 'skeptic', difficulty: 'ice_cold', label: 'Earn the trust', desc: 'Get a hard skeptic to agree to a next step.' },
  { persona: 'rusher', difficulty: 'cold', label: 'Speed round', desc: 'Win the deal in under 4 minutes with a rushed buyer.' },
  { persona: 'indifferent', difficulty: 'warm', label: 'Create urgency', desc: 'Turn an indifferent buyer into a warm one.' },
  { persona: 'executive', difficulty: 'ice_cold', label: 'C-Suite pitch', desc: 'Lead with ROI and earn an exec\'s attention in 60 seconds.' },
  { persona: 'champion', difficulty: 'warm', label: 'Build the case', desc: 'Help a champion sell internally — give them the ammo they need.' },
];

const CERTIFICATIONS = [
  { id: 'opener', label: 'Cold Opener', emoji: '🧊', threshold: 5, desc: '5 calls completed' },
  { id: 'handler', label: 'Objection Handler', emoji: '🛡️', threshold: 10, desc: '10 calls completed' },
  { id: 'closer', label: 'Qualified Closer', emoji: '🏆', threshold: 20, desc: '20 calls completed' },
  { id: 'ace', label: 'Top Rep', emoji: '⚡', threshold: 80, desc: 'Avg score above 80' },
];

function computeXP(callCount: number, avgScore: number): number {
  return callCount * 10 + Math.round(avgScore / 10) * callCount;
}

function xpToNextLevel(xp: number): { level: number; progress: number; needed: number } {
  const thresholds = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];
  let level = 1;
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
    else {
      const progress = xp - thresholds[i - 1];
      const needed = thresholds[i] - thresholds[i - 1];
      return { level, progress, needed };
    }
  }
  return { level, progress: 100, needed: 100 };
}

function getDailyChallenge(): typeof DAILY_CHALLENGES[0] {
  const dayIndex = Math.floor(Date.now() / 86400000) % DAILY_CHALLENGES.length;
  return DAILY_CHALLENGES[dayIndex];
}

export default function HomeScreen({ navigation }: Props) {
  const [userName, setUserName] = useState('Rep');
  const [sessions, setSessions] = useState<SparringSession[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserName(user.email?.split('@')[0] || 'Rep');
      const { data } = await supabase
        .from('sparring_sessions')
        .select('id, score, created_at, buyer_persona, difficulty')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (data) setSessions(data as SparringSession[]);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  const scored = sessions.filter(s => s.score > 0);
  const callCount = sessions.length;
  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length)
    : 0;
  const xp = computeXP(callCount, avgScore);
  const { level, progress, needed } = xpToNextLevel(xp);
  const streak = computeStreak(sessions);
  const challenge = getDailyChallenge();

  const earnedCerts = CERTIFICATIONS.filter(cert => {
    if (cert.id === 'ace') return avgScore >= 80;
    return callCount >= cert.threshold;
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hey, {userName}</Text>
          <Text style={styles.tagline}>Ready to spar?</Text>
        </View>
        {streak > 0 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakCount}>{streak}</Text>
          </View>
        )}
      </View>

      {/* XP bar */}
      <View style={styles.xpCard}>
        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>Level {level}</Text>
          <Text style={styles.xpValue}>{xp} XP</Text>
        </View>
        <View style={styles.xpBar}>
          <View style={[styles.xpFill, { width: `${Math.round((progress / needed) * 100)}%` as any }]} />
        </View>
        <Text style={styles.xpNext}>{needed - progress} XP to Level {level + 1}</Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{callCount}</Text>
          <Text style={styles.statLabel}>Calls</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, avgScore >= 80 ? styles.green : avgScore >= 60 ? styles.amber : styles.red]}>
            {avgScore || '—'}
          </Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.orange]}>{streak > 0 ? `${streak}🔥` : '—'}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
      </View>

      {/* Daily challenge */}
      <View style={styles.challengeCard}>
        <Text style={styles.challengeBadge}>TODAY'S CHALLENGE</Text>
        <Text style={styles.challengeTitle}>{challenge.label}</Text>
        <Text style={styles.challengeDesc}>{challenge.desc}</Text>
        <TouchableOpacity
          style={styles.challengeButton}
          onPress={() => navigation.navigate('VoiceCall', { setup: { persona: challenge.persona, difficulty: challenge.difficulty } })}
        >
          <Text style={styles.challengeButtonText}>Accept Challenge →</Text>
        </TouchableOpacity>
      </View>

      {/* Main CTA */}
      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => navigation.navigate('VoiceCall', {})}
      >
        <Text style={styles.ctaIcon}>🎙️</Text>
        <Text style={styles.ctaText}>Start a Call</Text>
        <Text style={styles.ctaSubtext}>Pick your buyer and go</Text>
      </TouchableOpacity>

      {/* Certifications */}
      {earnedCerts.length > 0 && (
        <View style={styles.certsSection}>
          <Text style={styles.certsTitle}>Earned</Text>
          <View style={styles.certsRow}>
            {earnedCerts.map(cert => (
              <View key={cert.id} style={styles.certBadge}>
                <Text style={styles.certEmoji}>{cert.emoji}</Text>
                <Text style={styles.certLabel}>{cert.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Next cert to earn */}
      {earnedCerts.length < CERTIFICATIONS.length && (
        <View style={styles.nextCertCard}>
          {(() => {
            const next = CERTIFICATIONS.find(c => !earnedCerts.find(e => e.id === c.id))!;
            const pct = next.id === 'ace'
              ? Math.min(100, Math.round((avgScore / 80) * 100))
              : Math.min(100, Math.round((callCount / next.threshold) * 100));
            return (
              <>
                <Text style={styles.nextCertLabel}>Next: {next.emoji} {next.label}</Text>
                <Text style={styles.nextCertDesc}>{next.desc}</Text>
                <View style={styles.certBar}>
                  <View style={[styles.certBarFill, { width: `${pct}%` as any }]} />
                </View>
                <Text style={styles.certPct}>{pct}%</Text>
              </>
            );
          })()}
        </View>
      )}
    </ScrollView>
  );
}

function computeStreak(sessions: SparringSession[]): number {
  const days = new Set(sessions.map(s => s.created_at.slice(0, 10)));
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingBottom: 60 },
  center: { justifyContent: 'center', alignItems: 'center' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16, marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: '800', color: '#fff' },
  tagline: { fontSize: 14, color: '#888', marginTop: 2 },
  streakBadge: {
    backgroundColor: '#2a1e0f',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#f0a50044',
    alignItems: 'center',
  },
  streakEmoji: { fontSize: 18 },
  streakCount: { fontSize: 18, fontWeight: '800', color: '#f0a500' },

  xpCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  xpLabel: { fontSize: 13, fontWeight: '700', color: '#fff' },
  xpValue: { fontSize: 13, color: '#6c63ff', fontWeight: '600' },
  xpBar: { height: 6, backgroundColor: '#2a2a3e', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  xpFill: { height: '100%', backgroundColor: '#6c63ff', borderRadius: 3 },
  xpNext: { fontSize: 11, color: '#666' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  statValue: { fontSize: 24, fontWeight: '800', color: '#6c63ff' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 3 },
  green: { color: '#4ade80' },
  amber: { color: '#f0a500' },
  red: { color: '#ef4444' },
  orange: { color: '#f0a500' },

  challengeCard: {
    backgroundColor: '#1a1030',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6c63ff44',
  },
  challengeBadge: { fontSize: 10, fontWeight: '800', color: '#6c63ff', letterSpacing: 1.5, marginBottom: 8 },
  challengeTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  challengeDesc: { fontSize: 13, color: '#aaa', lineHeight: 20, marginBottom: 16 },
  challengeButton: {
    backgroundColor: '#6c63ff22',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#6c63ff66',
    alignSelf: 'flex-start',
  },
  challengeButtonText: { color: '#a78bfa', fontWeight: '700', fontSize: 13 },

  ctaButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  ctaIcon: { fontSize: 36, marginBottom: 8 },
  ctaText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  ctaSubtext: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  certsSection: { marginBottom: 16 },
  certsTitle: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 10 },
  certsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  certBadge: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
    minWidth: 80,
  },
  certEmoji: { fontSize: 22, marginBottom: 4 },
  certLabel: { fontSize: 11, color: '#aaa', fontWeight: '600', textAlign: 'center' },

  nextCertCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 8,
  },
  nextCertLabel: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 4 },
  nextCertDesc: { fontSize: 12, color: '#888', marginBottom: 10 },
  certBar: { height: 5, backgroundColor: '#2a2a3e', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  certBarFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 3 },
  certPct: { fontSize: 11, color: '#4ade80', fontWeight: '600' },
});
