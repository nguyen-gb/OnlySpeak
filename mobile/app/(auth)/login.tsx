import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { MessageCircle } from 'lucide-react-native';
import { useAuthStore } from '../../stores/authStore';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const googleLogin = useAuthStore((state) => state.googleLogin);
  const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
  const googleNativeClientId = Platform.select({
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    default: googleWebClientId,
  }) || googleWebClientId;
  const hasGoogleClientId = Boolean(googleNativeClientId);
  const [googleRequest, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: googleNativeClientId,
    webClientId: googleWebClientId || undefined,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
    selectAccount: true,
  });

  useEffect(() => {
    const finishGoogleLogin = async () => {
      if (googleResponse?.type !== 'success') return;

      const idToken = googleResponse.params.id_token;
      if (!idToken) {
        setError('Google did not return a login token');
        return;
      }

      setIsLoading(true);
      setError('');
      try {
        await googleLogin(idToken);
        router.replace('/(tabs)/dashboard');
      } catch (err: any) {
        setError(err.message || 'Google login failed');
      } finally {
        setIsLoading(false);
      }
    };

    finishGoogleLogin();
  }, [googleLogin, googleResponse]);

  const handleGoogleLogin = async () => {
    if (!hasGoogleClientId) {
      setError('Google login is not configured');
      return;
    }

    setError('');
    await promptGoogle();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <MessageCircle color="#fff" size={32} />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in with Google to continue practicing</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.googleButton, (!googleRequest || isLoading || !hasGoogleClientId) && styles.buttonDisabled]}
          onPress={handleGoogleLogin}
          disabled={!googleRequest || isLoading || !hasGoogleClientId}
        >
          {isLoading ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleButtonText}>Sign in with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#ea3b92',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  googleButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  googleIcon: {
    color: '#4285f4',
    fontSize: 18,
    fontWeight: '900',
  },
});
