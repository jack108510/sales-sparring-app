import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RootStackParamList, TabParamList, SparringSession } from '../types';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Home'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

export default function HomeScreen({ navigation }: Props) {
  const [userName, setUserName] = useState('');
  const [stats, setStats] = useState({ callsDone: 0, avgScore: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserName(user.email?.split('@')[0] || 'Rep');
      const { data: sessions } = await supabase
        .from('sparring_sessions')
        .select('score')
        .eq('user_id', user.id);
      if (sessions && sessions.length > 0) {
        const avg = sessions.reduce((sum: number, s: Pick<SparringSession, 'score'>) => sum + s.score, 0) / sessions.length;
        setStats({ callsDone: sessions.length, avgScore: Math.round(avg) });
      }
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hey, {userName} 👋</Text>
      <Text style={styles.tagline}>Ready to sharpen your pitch?</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.callsDone}</Text>
          <Text style={styles.statLabel}>Calls Done</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.avgScore > 0 ? stats.avgScore : '—'}</Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => navigation.navigate('VoiceCall')}
      >
        <Text style={styles.ctaIcon}>🎙️</Text>
        <Text style={styles.ctaText}>Start Practice Call</Text>
        <Text style={styles.ctaSubtext}>AI buyer is ready</Text>
      </TouchableOpacity>

      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>Today's Focus</Text>
        <Text style={styles.tipItem}>✓ Handle objections with curiosity, not defense</Text>
        <Text style={styles.tipItem}>✓ Ask for the close directly</Text>
        <Text style={styles.tipItem}>✓ Mirror your prospect's language</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingBottom: 48 },
  center: { justifyContent: 'center', alignItems: 'center' },
  greeting: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 16 },
  tagline: { fontSize: 15, color: '#888', marginTop: 4, marginBottom: 28 },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  statCard: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  statValue: { fontSize: 36, fontWeight: '800', color: '#6c63ff' },
  statLabel: { fontSize: 13, color: '#888', marginTop: 4 },
  ctaButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 28,
  },
  ctaIcon: { fontSize: 40, marginBottom: 8 },
  ctaText: { fontSize: 22, fontWeight: '800', color: '#fff' },
  ctaSubtext: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  tipsCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  tipsTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 12 },
  tipItem: { fontSize: 14, color: '#aaa', marginBottom: 8 },
});
