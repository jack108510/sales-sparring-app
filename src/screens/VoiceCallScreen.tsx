import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Modal,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, BuyerPersona, Difficulty, BuyerSetup } from '../types';
import { supabase } from '../lib/supabase';
import Constants from 'expo-constants';

const SUPABASE_URL = (Constants.expoConfig?.extra?.supabaseUrl as string) || '';
const RETELL_AGENT_ID = (Constants.expoConfig?.extra?.retellAgentId as string) || '';

type CallStatus = 'setup' | 'idle' | 'connecting' | 'live' | 'ended';
type LiveStatus = Exclude<CallStatus, 'setup'>;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'VoiceCall'>;
  route: RouteProp<RootStackParamList, 'VoiceCall'>;
};

const PERSONAS: { id: BuyerPersona; label: string; emoji: string; hint: string }[] = [
  { id: 'skeptic', label: 'The Skeptic', emoji: '🤨', hint: 'Challenges every claim. Wants proof.' },
  { id: 'rusher', label: 'The Rusher', emoji: '⏩', hint: 'No time. Gets to the point fast.' },
  { id: 'price_hunter', label: 'Price Hunter', emoji: '💸', hint: 'Always hunting for a lower price.' },
  { id: 'indifferent', label: 'The Indifferent', emoji: '😐', hint: 'Hard to engage. Low urgency.' },
  { id: 'executive', label: 'The Executive', emoji: '💼', hint: 'Big picture only. ROI-driven.' },
  { id: 'champion', label: 'The Champion', emoji: '🤝', hint: 'Interested — needs internal ammo.' },
];

const DIFFICULTIES: { id: Difficulty; label: string; desc: string; color: string }[] = [
  { id: 'warm', label: 'Warm', desc: 'Friendly, open to the conversation', color: '#4ade80' },
  { id: 'cold', label: 'Cold', desc: 'Guarded, takes work to open up', color: '#60a5fa' },
  { id: 'ice_cold', label: 'Ice Cold', desc: 'Resistant, skeptical, impatient', color: '#a78bfa' },
];

const PLAYBOOK_STEPS = [
  { id: 'open', label: 'Set the stage', hint: 'Confirm reason for call, set agenda' },
  { id: 'pain', label: 'Surface the pain', hint: 'Ask at least 2 discovery questions' },
  { id: 'quantify', label: 'Quantify impact', hint: 'Get dollar, time, or urgency number' },
  { id: 'handle', label: 'Handle resistance', hint: 'Address price, timing, trust or fit' },
  { id: 'close', label: 'Earn the next step', hint: 'Close, book, or collect payment' },
];

export default function VoiceCallScreen({ navigation, route }: Props) {
  const presetSetup = route.params?.setup;

  const [status, setStatus] = useState<CallStatus>(presetSetup ? 'idle' : 'setup');
  const [selectedPersona, setSelectedPersona] = useState<BuyerPersona>(presetSetup?.persona ?? 'skeptic');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(presetSetup?.difficulty ?? 'cold');
  const [userScript, setUserScript] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [webCallLink, setWebCallLink] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showWebView, setShowWebView] = useState(false);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [playbookDone, setPlaybookDone] = useState<string[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function loadScript() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_profiles')
        .select('script_text')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.script_text) setUserScript(data.script_text);
    }
    loadScript();
  }, []);

  useEffect(() => {
    if (status === 'live') {
      startPulse();
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
    } else {
      stopPulse();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  function startPulse() {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }

  function stopPulse() {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }

  async function handleStartCall() {
    setStatus('connecting');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not logged in');

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/retell-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          agent_id: RETELL_AGENT_ID,
          variables: {
            buyer_persona: selectedPersona,
            difficulty: selectedDifficulty,
            ...(userScript ? { user_pitch: userScript } : {}),
          },
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const webCall = await resp.json();
      setCallId(webCall.call_id);
      setWebCallLink(webCall.web_call_link);
      setStartTime(Date.now());
      setStatus('live');
      setShowWebView(true);
    } catch (err: unknown) {
      setStatus('idle');
      Alert.alert('Could not start call', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function handleEndCall() {
    setShowWebView(false);
    setStatus('ended');
    const duration = startTime ? Math.round((Date.now() - startTime) / 1000) : elapsed;

    const { data: { user } } = await supabase.auth.getUser();
    if (user && callId) {
      const { data: sess } = await supabase
        .from('sparring_sessions')
        .insert({
          user_id: user.id,
          retell_call_id: callId,
          duration_seconds: duration,
          score: 0,
          feedback_json: null,
          buyer_persona: selectedPersona,
          difficulty: selectedDifficulty,
        })
        .select()
        .single();

      if (sess) {
        navigation.replace('CallResults', { sessionId: sess.id });
        return;
      }
    }
    navigation.goBack();
  }

  function togglePlaybookStep(id: string) {
    setPlaybookDone(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  const persona = PERSONAS.find(p => p.id === selectedPersona)!;
  const difficulty = DIFFICULTIES.find(d => d.id === selectedDifficulty)!;

  // Pre-call setup screen
  if (status === 'setup') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.setupContent}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.setupTitle}>Set Up Your Call</Text>
        <Text style={styles.setupSub}>Choose who you're selling to.</Text>

        <Text style={styles.sectionLabel}>Buyer</Text>
        {PERSONAS.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.personaCard, selectedPersona === p.id && styles.personaCardSelected]}
            onPress={() => setSelectedPersona(p.id)}
          >
            <Text style={styles.personaEmoji}>{p.emoji}</Text>
            <View style={styles.personaInfo}>
              <Text style={styles.personaLabel}>{p.label}</Text>
              <Text style={styles.personaHint}>{p.hint}</Text>
            </View>
            {selectedPersona === p.id && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Difficulty</Text>
        <View style={styles.diffRow}>
          {DIFFICULTIES.map(d => (
            <TouchableOpacity
              key={d.id}
              style={[styles.diffCard, selectedDifficulty === d.id && { borderColor: d.color, backgroundColor: d.color + '15' }]}
              onPress={() => setSelectedDifficulty(d.id)}
            >
              <Text style={[styles.diffLabel, selectedDifficulty === d.id && { color: d.color }]}>{d.label}</Text>
              <Text style={styles.diffDesc}>{d.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.goButton} onPress={() => setStatus('idle')}>
          <Text style={styles.goButtonText}>Ready to Spar →</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Idle/connecting/ended state
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>✕</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Practice Call</Text>

      <View style={styles.buyerPill}>
        <Text style={styles.buyerPillText}>{persona.emoji} {persona.label} · </Text>
        <Text style={[styles.buyerPillText, { color: difficulty.color }]}>{difficulty.label}</Text>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
        <Text style={[styles.statusText, { color: statusColors[status] }]}>{statusLabels[status]}</Text>
      </View>

      <View style={styles.pulseContainer}>
        <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulseAnim }], opacity: status === 'live' ? 0.3 : 0 }]} />
        <View style={[styles.micCircle, status === 'live' && styles.micCircleLive]}>
          <Text style={styles.micIcon}>{persona.emoji}</Text>
        </View>
      </View>

      {status === 'live' && <Text style={styles.timer}>{formatTime(elapsed)}</Text>}

      {status === 'idle' && (
        <TouchableOpacity style={styles.startButton} onPress={handleStartCall}>
          <Text style={styles.startButtonText}>Start Call</Text>
        </TouchableOpacity>
      )}
      {status === 'idle' && (
        <TouchableOpacity style={styles.changeSetupButton} onPress={() => setStatus('setup')}>
          <Text style={styles.changeSetupText}>Change buyer</Text>
        </TouchableOpacity>
      )}

      {status === 'connecting' && (
        <View style={styles.connectingIndicator}>
          <Text style={styles.connectingText}>⏳ Connecting to {persona.label}...</Text>
        </View>
      )}

      {status === 'live' && !showWebView && (
        <View style={styles.liveActions}>
          <TouchableOpacity style={styles.playbookButton} onPress={() => setPlaybookOpen(true)}>
            <Text style={styles.playbookButtonText}>📋 Playbook ({playbookDone.length}/5)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.endButton} onPress={handleEndCall}>
            <Text style={styles.endButtonText}>End Call</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mid-call Playbook modal */}
      <Modal visible={playbookOpen} transparent animationType="slide" onRequestClose={() => setPlaybookOpen(false)}>
        <View style={styles.playbookOverlay}>
          <View style={styles.playbookSheet}>
            <View style={styles.playbookHeader}>
              <Text style={styles.playbookTitle}>The Playbook</Text>
              <TouchableOpacity onPress={() => setPlaybookOpen(false)}>
                <Text style={styles.playbookClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.playbookSub}>Tap each stage when you've covered it.</Text>
            {PLAYBOOK_STEPS.map((step, i) => {
              const done = playbookDone.includes(step.id);
              return (
                <TouchableOpacity
                  key={step.id}
                  style={[styles.playbookStep, done && styles.playbookStepDone]}
                  onPress={() => togglePlaybookStep(step.id)}
                >
                  <View style={[styles.playbookDot, done && styles.playbookDotDone]}>
                    <Text style={styles.playbookDotText}>{done ? '✓' : i + 1}</Text>
                  </View>
                  <View style={styles.playbookStepInfo}>
                    <Text style={[styles.playbookStepLabel, done && styles.playbookStepLabelDone]}>{step.label}</Text>
                    <Text style={styles.playbookStepHint}>{step.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* WebView call modal */}
      <Modal visible={showWebView} animationType="slide" onRequestClose={handleEndCall}>
        <SafeAreaView style={styles.webViewContainer}>
          <View style={styles.webViewHeader}>
            <View>
              <Text style={styles.webViewTitle}>{persona.emoji} {persona.label}</Text>
              <Text style={[styles.webViewDiff, { color: difficulty.color }]}>{difficulty.label}</Text>
            </View>
            <View style={styles.webViewActions}>
              <TouchableOpacity style={styles.webPlaybookBtn} onPress={() => setPlaybookOpen(true)}>
                <Text style={styles.webPlaybookBtnText}>📋</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.endCallOverlay} onPress={handleEndCall}>
                <Text style={styles.endCallOverlayText}>End Call</Text>
              </TouchableOpacity>
            </View>
          </View>
          {webCallLink && (
            <WebView
              source={{ uri: webCallLink }}
              style={styles.webView}
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const statusLabels: Record<LiveStatus, string> = {
  idle: 'Ready to spar',
  connecting: 'Connecting...',
  live: 'Call live',
  ended: 'Call ended',
};

const statusColors: Record<LiveStatus, string> = {
  idle: '#888',
  connecting: '#f0a500',
  live: '#4ade80',
  ended: '#ef4444',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  setupContent: { padding: 24, paddingBottom: 60 },
  backButton: { position: 'absolute', top: 56, left: 24, zIndex: 10, padding: 4 },
  backText: { fontSize: 20, color: '#888' },

  setupTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 72, marginBottom: 4 },
  setupSub: { fontSize: 14, color: '#888', marginBottom: 24 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },

  personaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  personaCardSelected: { borderColor: '#6c63ff', backgroundColor: '#1a1030' },
  personaEmoji: { fontSize: 24, marginRight: 12 },
  personaInfo: { flex: 1 },
  personaLabel: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  personaHint: { fontSize: 12, color: '#777' },
  checkmark: { fontSize: 18, color: '#6c63ff', fontWeight: '700' },

  diffRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  diffCard: {
    flex: 1,
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    alignItems: 'center',
  },
  diffLabel: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
  diffDesc: { fontSize: 10, color: '#666', textAlign: 'center' },

  goButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  goButtonText: { color: '#fff', fontWeight: '800', fontSize: 17 },

  title: { fontSize: 22, fontWeight: '800', color: '#fff', position: 'absolute', top: 60 },
  buyerPill: {
    position: 'absolute',
    top: 100,
    flexDirection: 'row',
    backgroundColor: '#1e1e2e',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  buyerPillText: { fontSize: 13, color: '#aaa', fontWeight: '600' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 48 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 16, fontWeight: '600' },

  pulseContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  pulseOuter: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#6c63ff' },
  micCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1e1e2e', borderWidth: 3, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  micCircleLive: { borderColor: '#6c63ff', backgroundColor: '#1a1a30' },
  micIcon: { fontSize: 44 },

  timer: { fontSize: 40, fontWeight: '800', color: '#fff', fontVariant: ['tabular-nums'], marginBottom: 24 },

  startButton: { backgroundColor: '#6c63ff', borderRadius: 50, paddingVertical: 18, paddingHorizontal: 48, marginTop: 16 },
  startButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  changeSetupButton: { marginTop: 14 },
  changeSetupText: { color: '#666', fontSize: 13 },

  connectingIndicator: { marginTop: 16 },
  connectingText: { color: '#f0a500', fontSize: 15 },

  liveActions: { gap: 12, width: '100%', alignItems: 'center' },
  playbookButton: {
    backgroundColor: '#1e1e2e',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  playbookButtonText: { color: '#aaa', fontWeight: '600', fontSize: 15 },
  endButton: { backgroundColor: '#ef4444', borderRadius: 50, paddingVertical: 18, paddingHorizontal: 48 },
  endButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },

  playbookOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
  playbookSheet: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48 },
  playbookHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  playbookTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  playbookClose: { fontSize: 15, color: '#6c63ff', fontWeight: '700' },
  playbookSub: { fontSize: 13, color: '#888', marginBottom: 20 },
  playbookStep: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 8, backgroundColor: '#1e1e2e', borderWidth: 1, borderColor: '#2a2a3e' },
  playbookStepDone: { borderColor: '#4ade8044', backgroundColor: '#0f1f17' },
  playbookDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2a2a3e', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  playbookDotDone: { backgroundColor: '#4ade80' },
  playbookDotText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  playbookStepInfo: { flex: 1 },
  playbookStepLabel: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  playbookStepLabelDone: { color: '#4ade80' },
  playbookStepHint: { fontSize: 12, color: '#888' },

  webViewContainer: { flex: 1, backgroundColor: '#0f0f1a' },
  webViewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  webViewTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  webViewDiff: { fontSize: 12, fontWeight: '600' },
  webViewActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  webPlaybookBtn: { backgroundColor: '#1e1e2e', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#2a2a3e' },
  webPlaybookBtnText: { fontSize: 18 },
  endCallOverlay: { backgroundColor: '#ef4444', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20 },
  endCallOverlayText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  webView: { flex: 1, backgroundColor: '#0f0f1a' },
});
