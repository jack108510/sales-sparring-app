import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, TabParamList, DrillCategory, DrillResult } from '../types';
import { supabase } from '../lib/supabase';
import Constants from 'expo-constants';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Drill'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const SUPABASE_URL = (Constants.expoConfig?.extra?.supabaseUrl as string) || '';

const CATEGORIES: { id: DrillCategory; label: string; emoji: string; color: string }[] = [
  { id: 'price', label: 'Price', emoji: '💰', color: '#f0a500' },
  { id: 'timing', label: 'Timing', emoji: '⏰', color: '#4ade80' },
  { id: 'trust', label: 'Trust', emoji: '🤝', color: '#60a5fa' },
  { id: 'authority', label: 'Authority', emoji: '🏛️', color: '#a78bfa' },
  { id: 'fit', label: 'Fit', emoji: '🎯', color: '#f472b6' },
];

const OBJECTIONS: Record<DrillCategory, string[]> = {
  price: [
    "Your price is way higher than what we're currently paying.",
    "We don't have budget for this right now.",
    "I can get something similar for half the cost.",
    "Send me a quote and I'll take a look later.",
    "We'd need to cut the price by at least 30% to make this work.",
  ],
  timing: [
    "This isn't a good time — we're swamped until Q4.",
    "We just signed a contract with someone else.",
    "Let's revisit this in six months.",
    "We're in a budget freeze right now.",
    "I need to finish a few projects before we can move on this.",
  ],
  trust: [
    "I've never heard of your company before.",
    "How do I know this will actually work for us?",
    "We had a bad experience with a similar product.",
    "Can you give me some references from clients in our industry?",
    "Your reviews online are kind of mixed.",
  ],
  authority: [
    "I'm not the decision maker — you'd need to talk to my VP.",
    "This has to go through our procurement committee.",
    "My boss would never approve this.",
    "We make decisions like this as a team.",
    "I can't sign anything without legal review.",
  ],
  fit: [
    "I don't think this is really built for companies like ours.",
    "Our process is pretty unique — I don't see how this fits.",
    "We already have something that does that.",
    "This seems like overkill for what we actually need.",
    "None of our team would actually use this.",
  ],
};

const ROUNDS = 5;

type Phase = 'pick' | 'drilling' | 'done';

export default function DrillScreen({ navigation }: Props) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [category, setCategory] = useState<DrillCategory | null>(null);
  const [round, setRound] = useState(0);
  const [objectionIndex, setObjectionIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [results, setResults] = useState<DrillResult[]>([]);
  const [scoring, setScoring] = useState(false);
  const [lastResult, setLastResult] = useState<DrillResult | null>(null);
  const [streak, setStreak] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  function pickCategory(cat: DrillCategory) {
    setCategory(cat);
    const indices = shuffleIndices(OBJECTIONS[cat].length);
    setObjectionIndex(indices[0]);
    setPhase('drilling');
    setRound(0);
    setResults([]);
    setLastResult(null);
    setStreak(0);
  }

  function shuffleIndices(len: number): number[] {
    const arr = Array.from({ length: len }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async function handleSubmit() {
    if (!response.trim() || !category || scoring) return;
    setScoring(true);

    const objection = OBJECTIONS[category][objectionIndex];
    const result = await scoreResponse(objection, response.trim(), category);

    const newResults = [...results, result];
    setResults(newResults);
    setLastResult(result);
    setStreak(result.score >= 70 ? streak + 1 : 0);

    fadeIn();

    if (round + 1 >= ROUNDS) {
      const avgScore = Math.round(newResults.reduce((s, r) => s + r.score, 0) / newResults.length);
      await saveDrillSession(newResults, avgScore);
      setPhase('done');
    }

    setScoring(false);
  }

  function nextRound() {
    const nextIdx = Math.floor(Math.random() * OBJECTIONS[category!].length);
    setObjectionIndex(nextIdx);
    setRound(r => r + 1);
    setResponse('');
    setLastResult(null);
    fadeIn();
  }

  function fadeIn() {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }

  async function scoreResponse(objection: string, rep: string, cat: DrillCategory): Promise<DrillResult> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/openai-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          temperature: 0.3,
          max_tokens: 200,
          messages: [
            {
              role: 'system',
              content: `You are a sales coach scoring a rep's objection response. Category: ${cat}. Score 0–100. Reply ONLY with JSON: {"score": number, "coaching": "one sentence tip"}`,
            },
            {
              role: 'user',
              content: `Buyer objection: "${objection}"\nRep response: "${rep}"`,
            },
          ],
        }),
      });

      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      return {
        objection,
        response: rep,
        score: Math.min(100, Math.max(0, parsed.score || 50)),
        coaching: parsed.coaching || 'Keep working on it.',
        category: cat,
      };
    } catch {
      return {
        objection,
        response: rep,
        score: 60,
        coaching: 'Focus on acknowledging the concern before pivoting.',
        category: cat,
      };
    }
  }

  async function saveDrillSession(rounds: DrillResult[], avgScore: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !category) return;
    await supabase.from('drill_sessions').insert({
      user_id: user.id,
      category,
      rounds,
      avg_score: avgScore,
    });
  }

  function reset() {
    setPhase('pick');
    setCategory(null);
    setRound(0);
    setResults([]);
    setLastResult(null);
    setResponse('');
    setStreak(0);
  }

  const currentCategory = CATEGORIES.find(c => c.id === category);
  const avgScore = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
    : 0;

  if (phase === 'pick') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>The Drill</Text>
        <Text style={styles.subtitle}>Pick an objection type and handle 5 in a row.</Text>

        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryCard, { borderColor: cat.color + '44' }]}
            onPress={() => pickCategory(cat.id)}
          >
            <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryLabel}>{cat.label} Objections</Text>
              <Text style={styles.categoryDesc}>{getCategoryDesc(cat.id)}</Text>
            </View>
            <Text style={[styles.categoryArrow, { color: cat.color }]}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  if (phase === 'done') {
    const scoreColor = avgScore >= 80 ? '#4ade80' : avgScore >= 60 ? '#f0a500' : '#ef4444';
    const bestTip = results.find(r => r.score === Math.max(...results.map(r2 => r2.score)))?.coaching;

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Drill Complete</Text>
        <View style={[styles.doneScoreRing, { borderColor: scoreColor }]}>
          <Text style={[styles.doneScore, { color: scoreColor }]}>{avgScore}</Text>
          <Text style={[styles.doneScoreLabel, { color: scoreColor }]}>avg score</Text>
        </View>

        {streak > 2 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>🔥 {streak} in a row</Text>
          </View>
        )}

        {bestTip && (
          <View style={styles.tipCard}>
            <Text style={styles.tipLabel}>Top takeaway</Text>
            <Text style={styles.tipText}>{bestTip}</Text>
          </View>
        )}

        <Text style={styles.roundsHeader}>Round breakdown</Text>
        {results.map((r, i) => (
          <View key={i} style={styles.roundCard}>
            <View style={styles.roundTop}>
              <Text style={styles.roundNum}>Round {i + 1}</Text>
              <Text style={[styles.roundScore, { color: r.score >= 70 ? '#4ade80' : r.score >= 50 ? '#f0a500' : '#ef4444' }]}>
                {r.score}
              </Text>
            </View>
            <Text style={styles.roundObjection} numberOfLines={2}>{r.objection}</Text>
            <Text style={styles.roundCoaching}>{r.coaching}</Text>
          </View>
        ))}

        <TouchableOpacity style={styles.retryButton} onPress={() => category && pickCategory(category)}>
          <Text style={styles.retryButtonText}>Drill Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.changeButton} onPress={reset}>
          <Text style={styles.changeButtonText}>Switch Category</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const objection = OBJECTIONS[category!][objectionIndex];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.drillingContent}>
        <View style={styles.drillHeader}>
          <Text style={styles.drillCat}>{currentCategory?.emoji} {currentCategory?.label}</Text>
          <Text style={styles.drillProgress}>{round + 1} / {ROUNDS}</Text>
        </View>

        {streak >= 2 && (
          <View style={styles.streakPill}>
            <Text style={styles.streakPillText}>🔥 {streak} streak</Text>
          </View>
        )}

        <Animated.View style={[styles.objectionCard, { opacity: fadeAnim }]}>
          <Text style={styles.objectionLabel}>Buyer says:</Text>
          <Text style={styles.objectionText}>"{objection}"</Text>
        </Animated.View>

        {lastResult ? (
          <Animated.View style={[styles.feedbackCard, { opacity: fadeAnim }]}>
            <View style={styles.feedbackTop}>
              <Text style={styles.feedbackScore}>
                Score: <Text style={{ color: lastResult.score >= 70 ? '#4ade80' : lastResult.score >= 50 ? '#f0a500' : '#ef4444' }}>
                  {lastResult.score}
                </Text>
              </Text>
            </View>
            <Text style={styles.feedbackCoach}>{lastResult.coaching}</Text>
            <TouchableOpacity style={styles.nextButton} onPress={nextRound}>
              <Text style={styles.nextButtonText}>{round + 1 >= ROUNDS ? 'See Results' : 'Next Objection →'}</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            <TextInput
              style={styles.responseInput}
              placeholder="How do you handle this?"
              placeholderTextColor="#555"
              value={response}
              onChangeText={setResponse}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.submitButton, (!response.trim() || scoring) && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={!response.trim() || scoring}
            >
              {scoring ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Response</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getCategoryDesc(cat: DrillCategory): string {
  const map: Record<DrillCategory, string> = {
    price: '"Too expensive" • "No budget" • Pricing pushback',
    timing: '"Not right now" • "Call me in Q4" • Delays',
    trust: '"Never heard of you" • Credibility concerns',
    authority: '"Not my call" • Stakeholder blockers',
    fit: '"Not a good match" • Feature gaps',
  };
  return map[cat];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingBottom: 60 },
  drillingContent: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 16, marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 28 },

  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
  },
  categoryEmoji: { fontSize: 28, marginRight: 14 },
  categoryInfo: { flex: 1 },
  categoryLabel: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 3 },
  categoryDesc: { fontSize: 12, color: '#666' },
  categoryArrow: { fontSize: 24, fontWeight: '300' },

  drillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  drillCat: { fontSize: 16, fontWeight: '700', color: '#fff' },
  drillProgress: { fontSize: 14, color: '#6c63ff', fontWeight: '700' },

  streakPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a1e0f',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0a50044',
  },
  streakPillText: { color: '#f0a500', fontSize: 13, fontWeight: '600' },

  objectionCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  objectionLabel: { fontSize: 12, color: '#666', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  objectionText: { fontSize: 17, color: '#fff', lineHeight: 26, fontStyle: 'italic' },

  responseInput: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 18,
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.4 },
  submitButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  feedbackCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 16,
  },
  feedbackTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  feedbackScore: { fontSize: 15, fontWeight: '700', color: '#fff' },
  feedbackCoach: { fontSize: 14, color: '#aaa', lineHeight: 21, marginBottom: 16 },
  nextButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  doneScoreRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  doneScore: { fontSize: 44, fontWeight: '900' },
  doneScoreLabel: { fontSize: 13, fontWeight: '600' },

  streakBadge: {
    alignSelf: 'center',
    backgroundColor: '#2a1e0f',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f0a50044',
  },
  streakText: { color: '#f0a500', fontSize: 14, fontWeight: '700' },

  tipCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#6c63ff44',
  },
  tipLabel: { fontSize: 11, color: '#6c63ff', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  tipText: { fontSize: 14, color: '#ccc', lineHeight: 21 },

  roundsHeader: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },
  roundCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  roundTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  roundNum: { fontSize: 13, color: '#888', fontWeight: '600' },
  roundScore: { fontSize: 16, fontWeight: '800' },
  roundObjection: { fontSize: 13, color: '#999', marginBottom: 6, fontStyle: 'italic' },
  roundCoaching: { fontSize: 13, color: '#aaa' },

  retryButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  retryButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  changeButton: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  changeButtonText: { color: '#aaa', fontWeight: '600', fontSize: 15 },
});
