import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function ProfileScreen() {
  const [email, setEmail] = useState('');
  const [joinDate, setJoinDate] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [editingScript, setEditingScript] = useState(false);
  const [savedScript, setSavedScript] = useState('');
  const [callCount, setCallCount] = useState(0);
  const [avgScore, setAvgScore] = useState(0);

  useEffect(() => {
    loadUser();
    loadStats();
    loadScript();
  }, []);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email || '');
      setJoinDate(new Date(user.created_at).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }));
    }
  }

  async function loadStats() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('sparring_sessions').select('score').eq('user_id', user.id);
    if (data) {
      setCallCount(data.length);
      const scored = data.filter(s => s.score > 0);
      if (scored.length > 0) {
        setAvgScore(Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length));
      }
    }
  }

  async function loadScript() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('script_text')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data?.script_text) {
      setSavedScript(data.script_text);
      setScriptText(data.script_text);
    }
  }

  async function saveScript() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_profiles').upsert({ user_id: user.id, script_text: scriptText }, { onConflict: 'user_id' });
    setSavedScript(scriptText);
    setEditingScript(false);
  }

  async function handleLogout() {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); } },
    ]);
  }

  const initials = email ? email[0].toUpperCase() : '?';

  const CERTS = [
    { id: 'opener', label: 'Cold Opener', emoji: '🧊', earned: callCount >= 5 },
    { id: 'handler', label: 'Objection Handler', emoji: '🛡️', earned: callCount >= 10 },
    { id: 'closer', label: 'Qualified Closer', emoji: '🏆', earned: callCount >= 20 },
    { id: 'ace', label: 'Top Rep', emoji: '⚡', earned: avgScore >= 80 },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>You</Text>

      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.email}>{email}</Text>
        {joinDate ? <Text style={styles.joinDate}>Member since {joinDate}</Text> : null}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{callCount}</Text>
          <Text style={styles.statLabel}>Calls</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: avgScore >= 80 ? '#4ade80' : avgScore >= 60 ? '#f0a500' : '#6c63ff' }]}>
            {avgScore || '—'}
          </Text>
          <Text style={styles.statLabel}>Avg Score</Text>
        </View>
      </View>

      {/* Certifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Certifications</Text>
        <View style={styles.certsGrid}>
          {CERTS.map(cert => (
            <View key={cert.id} style={[styles.certCard, !cert.earned && styles.certCardLocked]}>
              <Text style={[styles.certEmoji, !cert.earned && styles.certEmojiLocked]}>{cert.emoji}</Text>
              <Text style={[styles.certLabel, !cert.earned && styles.certLabelLocked]}>{cert.label}</Text>
              {!cert.earned && <Text style={styles.lockedTag}>locked</Text>}
            </View>
          ))}
        </View>
      </View>

      {/* Your Pitch */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Your Pitch</Text>
          {!editingScript && (
            <TouchableOpacity onPress={() => setEditingScript(true)}>
              <Text style={styles.editLink}>{savedScript ? 'Edit' : 'Add'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.sectionDesc}>
          Paste your product pitch or key selling points. The AI buyer will know what you're selling.
        </Text>
        {editingScript ? (
          <>
            <TextInput
              style={styles.scriptInput}
              value={scriptText}
              onChangeText={setScriptText}
              placeholder="Our product helps sales teams..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <View style={styles.scriptActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setScriptText(savedScript); setEditingScript(false); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveScript}>
                <Text style={styles.saveButtonText}>Save Pitch</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          savedScript ? (
            <Text style={styles.scriptPreview} numberOfLines={3}>{savedScript}</Text>
          ) : (
            <TouchableOpacity style={styles.addScriptButton} onPress={() => setEditingScript(true)}>
              <Text style={styles.addScriptButtonText}>+ Add your pitch</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValue}>1.1.0</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingBottom: 60 },
  header: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 16, marginBottom: 24 },

  avatarContainer: { alignItems: 'center', marginBottom: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#6c63ff', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  email: { fontSize: 15, color: '#fff', fontWeight: '600' },
  joinDate: { fontSize: 12, color: '#666', marginTop: 3 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#1e1e2e', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a3e' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#6c63ff' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 3 },

  section: { backgroundColor: '#1e1e2e', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2a2a3e' },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionDesc: { fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 12, marginTop: -4 },
  editLink: { fontSize: 13, color: '#6c63ff', fontWeight: '600' },

  certsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  certCard: { backgroundColor: '#2a2a3e', borderRadius: 12, padding: 12, alignItems: 'center', minWidth: 80, flex: 1 },
  certCardLocked: { opacity: 0.4 },
  certEmoji: { fontSize: 24, marginBottom: 4 },
  certEmojiLocked: { opacity: 0.5 },
  certLabel: { fontSize: 11, color: '#fff', fontWeight: '600', textAlign: 'center' },
  certLabelLocked: { color: '#666' },
  lockedTag: { fontSize: 9, color: '#555', marginTop: 3 },

  scriptInput: { backgroundColor: '#0f0f1a', borderRadius: 12, padding: 14, color: '#fff', fontSize: 14, lineHeight: 21, minHeight: 110, borderWidth: 1, borderColor: '#2a2a3e', marginBottom: 12 },
  scriptActions: { flexDirection: 'row', gap: 10 },
  cancelButton: { flex: 1, backgroundColor: '#2a2a3e', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelButtonText: { color: '#888', fontWeight: '600', fontSize: 14 },
  saveButton: { flex: 1, backgroundColor: '#6c63ff', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scriptPreview: { fontSize: 13, color: '#888', lineHeight: 20, fontStyle: 'italic' },
  addScriptButton: { backgroundColor: '#0f0f1a', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#2a2a3e' },
  addScriptButtonText: { color: '#666', fontSize: 13 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2a2a3e' },
  infoLabel: { fontSize: 14, color: '#aaa' },
  infoValue: { fontSize: 14, color: '#fff', fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

  logoutButton: { backgroundColor: '#1e1e2e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444', marginTop: 8 },
  logoutText: { color: '#ef4444', fontWeight: '700', fontSize: 16 },
});
