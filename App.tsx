import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Animated, Linking, Platform, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import { Video, ResizeMode } from 'expo-av';
import Constants from 'expo-constants';
import {
  setupIAP,
  purchaseProduct,
  restorePurchases,
  addPurchaseListener,
} from './src/lib/iap';
// Guarded import — expo-speech-recognition requires a dev build, not Expo Go.
// This lets the app run in Expo Go (text-only fallback) while keeping voice in dev builds.
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (_event: string, _handler: (e: any) => void) => {};
try {
  const mod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch (_e) {
  // Module not available (Expo Go) — speech recognition disabled, text fallback used
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface WebViewMessage {
  type: string;
  [key: string]: unknown;
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [html, setHtml] = useState<string | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const [webViewReady, setWebViewReady] = useState(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const videoFinished = useRef(false);
  const videoRef = useRef<any>(null);
  const seeked = useRef(false);
  const webViewRef = useRef<WebView>(null);

  // ── Speech recognition state ───────────────────────────────────────────────
  // Tracks whether native speech recognition is currently active, so we don't
  // start it twice and can short-circuit stop requests.
  const speechActiveRef = useRef(false);

  // ── Load HTML asset ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const isExpoGo = Constants.appOwnership === 'expo';
        const htmlAsset = (__DEV__ || isExpoGo)
          ? require('./assets/index.dev.html')
          : require('./assets/index.html');
        const [asset] = await Asset.loadAsync(htmlAsset);
        const resp = await fetch(asset.localUri!);
        const text = await resp.text();
        if (text && text.length > 100) {
          setHtml(text);
        }
      } catch (e) {
        console.error('Failed to load HTML asset:', e);
      }
    })();
  }, []);

  // ── Initialize IAP & purchase listener ────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    let removePurchaseListener: (() => void) | null = null;

    (async () => {
      await setupIAP();

      removePurchaseListener = addPurchaseListener(
        // onSuccess
        (plan: string) => {
          console.log('[IAP] Purchase successful, plan:', plan);
          postToWebView({ type: 'iap_purchase_success', plan });
        },
        // onError
        (message: string) => {
          console.warn('[IAP] Purchase error:', message);
          postToWebView({ type: 'iap_purchase_error', message });
        },
      );
    })();

    return () => {
      removePurchaseListener?.();
    };
  }, []);

  // ── Splash helpers ─────────────────────────────────────────────────────────
  const dismissSplash = () => {
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => setSplashDone(true));
  };

  const onVideoFinish = () => {
    videoFinished.current = true;
    if (webViewReady) dismissSplash();
  };

  useEffect(() => {
    if (webViewReady && videoFinished.current) dismissSplash();
  }, [webViewReady]);

  // ── WebView → Native messaging ─────────────────────────────────────────────
  const postToWebView = (payload: object) => {
    const js = `
      if (window.onNativeMessage) {
        window.onNativeMessage(${JSON.stringify(payload)});
      }
      true;
    `;
    webViewRef.current?.injectJavaScript(js);
  };

  // ── Speech recognition event listeners ──────────────────────────────────────
  // These forward native SFSpeechRecognizer events back into the WebView as
  // JSON messages that window.onNativeMessage handles.
  useSpeechRecognitionEvent('result', (event: any) => {
    const best = event.results && event.results[0];
    if (!best) return;
    postToWebView({
      type: 'speech_result',
      transcript: best.transcript,
      isFinal: (event as any).isFinal !== false,
    });
  });

  useSpeechRecognitionEvent('error', (event: any) => {
    speechActiveRef.current = false;
    const code = (event as any)?.error || 'unknown';
    let friendly = 'Speech recognition error';
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      friendly = 'Microphone or speech recognition permission denied.';
    } else if (code === 'no-speech') {
      friendly = 'No speech detected. Try again.';
    } else if (code === 'audio-busy') {
      friendly = 'Microphone is busy. Try again in a moment.';
    }
    postToWebView({ type: 'speech_error', error: friendly, code });
  });

  useSpeechRecognitionEvent('end', () => {
    speechActiveRef.current = false;
    postToWebView({ type: 'speech_end' });
  });

  const handleWebViewMessage = async (event: { nativeEvent: { data: string } }) => {
    let msg: WebViewMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    switch (msg.type) {
      // ── Open external URL (legacy) ─────────────────────────────────────────
      case 'openURL': {
        if (typeof msg.url === 'string') {
          // Never let legacy checkout/payment links escape to Safari on iOS.
          // Purchases must stay inside the native StoreKit bridge.
          if (/stripe|checkout|billing|payment/i.test(msg.url)) {
            postToWebView({ type: 'show_upgrade_sheet' });
          } else {
            Linking.openURL(msg.url);
          }
        }
        break;
      }

      // ── Trigger StoreKit purchase ──────────────────────────────────────────
      case 'iap_purchase': {
        const productId = msg.productId as string;
        if (!productId) break;

        postToWebView({ type: 'iap_purchase_started', productId });
        const result = await purchaseProduct(productId);
        if (result.success && result.plan) {
          postToWebView({ type: 'iap_purchase_success', plan: result.plan });
        } else if (!result.success && result.error && result.error !== 'cancelled') {
          Alert.alert('Purchase Failed', result.error);
          postToWebView({ type: 'iap_purchase_error', message: result.error });
        } else if (!result.success && result.error === 'cancelled') {
          postToWebView({ type: 'iap_purchase_error', message: 'cancelled' });
        }
        // On most devices success comes via the PurchaseUpdated event listener.
        // If expo-iap returns a purchase directly, the result.plan branch above
        // handles it so the web UI never sits on "Opening…" forever.
        break;
      }

      // ── Restore purchases ──────────────────────────────────────────────────
      case 'iap_restore': {
        const result = await restorePurchases();
        if (result.success && result.plan) {
          postToWebView({ type: 'iap_purchase_success', plan: result.plan });
        } else {
          const msg2 = result.error || 'No previous purchases found';
          Alert.alert('Restore Purchases', msg2);
          postToWebView({ type: 'iap_restore_error', message: msg2 });
        }
        break;
      }

      // ── Speech recognition: start listening ─────────────────────────────────
      case 'speech_start': {
        if (speechActiveRef.current) break;
        if (!ExpoSpeechRecognitionModule) {
          postToWebView({ type: 'speech_error', error: 'Speech recognition not available in Expo Go.' });
          break;
        }
        try {
          await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        } catch {
          // ignore — start() will surface a permission error if needed
        }
        try {
          ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: true,
          });
          speechActiveRef.current = true;
        } catch (e) {
          speechActiveRef.current = false;
          postToWebView({
            type: 'speech_error',
            error: 'Could not start speech recognition.',
          });
        }
        break;
      }

      // ── Speech recognition: stop listening ──────────────────────────────────
      case 'speech_stop': {
        if (!speechActiveRef.current) break;
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch {
          // ignore
        }
        speechActiveRef.current = false;
        break;
      }

      default:
        break;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar style="light" hidden />

      {html && (
        <WebView
          ref={webViewRef}
          source={{ html, baseUrl: 'https://salessparring.ca' }}
          style={styles.webview}
          originWhitelist={['*']}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          allowFileAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowsInlineMediaPlayback
          mixedContentMode="always"
          onLoad={() => setWebViewReady(true)}
          onMessage={handleWebViewMessage}
          onShouldStartLoadWithRequest={(req) => {
            // Never let legacy checkout/payment navigations leave the app.
            if (/stripe|checkout|billing|payment/i.test(req.url || '')) {
              postToWebView({ type: 'show_upgrade_sheet' });
              return false;
            }
            // Intercept external URLs and open in Safari
            if (
              req.url &&
              !req.url.startsWith('https://salessparring.ca') &&
              !req.url.startsWith('about:') &&
              req.navigationType === 'click'
            ) {
              Linking.openURL(req.url);
              return false;
            }
            return true;
          }}
        />
      )}

      {!splashDone && (
        <Animated.View
          style={[styles.splash, { opacity: splashOpacity }]}
          pointerEvents="none"
        >
          <Video
            ref={videoRef}
            source={require('./assets/splash.mp4')}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
            isMuted
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded && !seeked.current && status.durationMillis) {
                seeked.current = true;
                videoRef.current?.setPositionAsync(status.durationMillis / 2);
              }
              if (status.isLoaded && status.didJustFinish) onVideoFinish();
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  webview: { flex: 1 },
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    width: 260,
    height: 260,
  },
});
