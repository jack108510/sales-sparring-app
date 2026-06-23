import React, { useEffect, useState } from 'react';
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
import { RootStackParamList, SparringSession } from '../types';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CallResults'>;
  route: RouteProp<RootStackParamList, 'CallResults'>;
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#f0a500' : '#ef4444';
  const label = score >= 80 ? 'Great' : score >= 60 ? 'Good' : score > 0 ? 'Needs Work' : 'Pending';
  return (
    <View style={[styles.scoreRing, { borderColor: color }]}>
      <Text style={[styles.scoreNumber, { color }]}>{score > 0 ? score : '—'}</Text>
      <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
    </View>
  );
}

export default function CallResultsScreen({ navigation, route }: Props) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<SparringSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  async function loadSession() {
    const { data } = await supabase
      .from('sparring_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();
    setSession(data);
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Session not found</Text>
      </View>
    );
  }

  const feedback = session.feedback_json;
  const durationMin = Math.floor(session.duration_seconds / 60);
  const durationSec = session.duration_seconds % 60;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Call Results</Text>
      <Text style={styles.dateText}>
        {new Date(session.created_at).toLocaleDateString('en-CA', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </Text>

      <View style={styles.scoreSection}>
        <ScoreRing score={session.score} />
        <Text style={styles.durationText}>
          Duration: {durationMin > 0 ? `${durationMin}m ` : ''}{durationSec}s
        </Text>
      </View>

      {feedback ? (
        <>
          {feedback.overall_summary && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Summary</Text>
              <Text style={styles.cardBody}>{feedback.overall_summary}</Text>
            </View>
          )}

          {feedback.strengths && feedback.strengths.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💪 Strengths</Text>
              {feedback.strengths.map((s, i) => (
                <Text key={i} style={styles.listItem}>• {s}</Text>
              ))}
            </View>
          )}

          {feedback.areas_to_improve && feedback.areas_to_improve.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🎯 Areas to Improve</Text>
              {feedback.areas_to_improve.map((a, i) => (
                <Text key={i} style={styles.listItem}>• {a}</Text>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Feedback Pending</Text>
          <Text style={styles.cardBody}>
            AI feedback will appear here once it's been processed. Check back shortly.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.doneButton}
        onPress={() => navigation.navigate('Main')}
      >
        <Text style={styles.doneButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingBottom: 60 },
  center: { justifyContent: 'center', alignItems: 'center' },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 16,
    marginBottom: 4,
  },
  dateText: { fontSize: 14, color: '#888', marginBottom: 28 },
  scoreSection: { alignItems: 'center', marginBottom: 32 },
  scoreRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  scoreNumber: { fontSize: 44, fontWeight: '900' },
  scoreLabel: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  durationText: { fontSize: 14, color: '#888' },
  card: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },
  cardBody: { fontSize: 14, color: '#aaa', lineHeight: 21 },
  listItem: { fontSize: 14, color: '#aaa', marginBottom: 8, lineHeight: 20 },
  errorText: { color: '#888', fontSize: 16 },
  doneButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
