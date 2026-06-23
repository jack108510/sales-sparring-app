import React, { useEffect, useState, useCallback } from 'react';
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
import { RootStackParamList, TabParamList, SparringSession } from '../types';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'History'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function scoreColor(score: number) {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#f0a500';
  return '#ef4444';
}

export default function SessionHistoryScreen({ navigation }: Props) {
  const [sessions, setSessions] = useState<SparringSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [])
  );

  async function loadSessions(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('sparring_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setSessions(data || []);
    }

    if (isRefresh) setRefreshing(false);
    else setLoading(false);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Session History</Text>
      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No sessions yet</Text>
          <Text style={styles.emptySubtext}>Start a practice call to see results here</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadSessions(true)}
              tintColor="#6c63ff"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('CallResults', { sessionId: item.id })}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                <Text style={styles.duration}>{formatDuration(item.duration_seconds)}</Text>
              </View>
              <View style={styles.scoreBadge}>
                <Text style={[styles.score, { color: item.score > 0 ? scoreColor(item.score) : '#555' }]}>
                  {item.score > 0 ? item.score : '—'}
                </Text>
                <Text style={styles.scoreLabel}>score</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 16,
  },
  list: { padding: 16 },
  card: {
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  cardLeft: { flex: 1 },
  date: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 4 },
  duration: { fontSize: 13, color: '#888' },
  scoreBadge: { alignItems: 'center' },
  score: { fontSize: 28, fontWeight: '800' },
  scoreLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#666', textAlign: 'center' },
});
