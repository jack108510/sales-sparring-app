import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { createRetellWebCall } from '../lib/retell';
import { supabase } from '../lib/supabase';

type CallStatus = 'idle' | 'connecting' | 'live' | 'ended';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'VoiceCall'>;
};

export default function VoiceCallScreen({ navigation }: Props) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'live') {
      startPulse();
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      stopPulse();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
      const webCall = await createRetellWebCall();
      setCallId(webCall.call_id);
      setStartTime(Date.now());
      setStatus('live');
    } catch (err: unknown) {
      setStatus('idle');
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Could not start call', message);
    }
  }

  async function handleEndCall() {
    setStatus('ended');
    const duration = startTime ? Math.round((Date.now() - startTime) / 1000) : elapsed;

    const { data: { user } } = await supabase.auth.getUser();
    if (user && callId) {
      const { data: session } = await supabase
        .from('sparring_sessions')
        .insert({
          user_id: user.id,
          duration_seconds: duration,
          score: 0,
          feedback_json: null,
        })
        .select()
        .single();

      if (session) {
        navigation.replace('CallResults', { sessionId: session.id });
        return;
      }
    }
    navigation.goBack();
  }

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  const statusLabel: Record<CallStatus, string> = {
    idle: 'Ready to spar',
    connecting: 'Connecting to AI buyer...',
    live: 'Call live',
    ended: 'Call ended',
  };

  const statusColor: Record<CallStatus, string> = {
    idle: '#888',
    connecting: '#f0a500',
    live: '#4ade80',
    ended: '#ef4444',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Practice Call</Text>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor[status] }]} />
        <Text style={[styles.statusText, { color: statusColor[status] }]}>
          {statusLabel[status]}
        </Text>
      </View>

      <View style={styles.pulseContainer}>
        <Animated.View
          style={[
            styles.pulseOuter,
            { transform: [{ scale: pulseAnim }], opacity: status === 'live' ? 0.3 : 0 },
          ]}
        />
        <View style={[styles.micCircle, status === 'live' && styles.micCircleLive]}>
          <Text style={styles.micIcon}>🎙️</Text>
        </View>
      </View>

      {status === 'live' && (
        <Text style={styles.timer}>{formatTime(elapsed)}</Text>
      )}

      {(status === 'idle') && (
        <TouchableOpacity style={styles.startButton} onPress={handleStartCall}>
          <Text style={styles.startButtonText}>Start Call</Text>
        </TouchableOpacity>
      )}

      {status === 'connecting' && (
        <View style={styles.connectingIndicator}>
          <Text style={styles.connectingText}>⏳ Dialing AI buyer...</Text>
        </View>
      )}

      {status === 'live' && (
        <TouchableOpacity style={styles.endButton} onPress={handleEndCall}>
          <Text style={styles.endButtonText}>End Call</Text>
        </TouchableOpacity>
      )}

      {callId && (
        <Text style={styles.callId} numberOfLines={1}>
          Call ID: {callId}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    position: 'absolute',
    top: 60,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 48,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pulseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  pulseOuter: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#6c63ff',
  },
  micCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1e1e2e',
    borderWidth: 3,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCircleLive: {
    borderColor: '#6c63ff',
    backgroundColor: '#1a1a30',
  },
  micIcon: { fontSize: 48 },
  timer: {
    fontSize: 40,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    marginBottom: 40,
  },
  startButton: {
    backgroundColor: '#6c63ff',
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginTop: 16,
  },
  startButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  connectingIndicator: { marginTop: 16 },
  connectingText: { color: '#f0a500', fontSize: 16 },
  endButton: {
    backgroundColor: '#ef4444',
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 48,
  },
  endButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  callId: {
    color: '#444',
    fontSize: 11,
    position: 'absolute',
    bottom: 40,
    paddingHorizontal: 16,
  },
});
