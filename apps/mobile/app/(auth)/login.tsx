import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/auth';
import type { User, AuthTokens } from '@wasp/types';

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3000';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  const handleLogin = useCallback(async () => {
    if (!username.trim() || !password) return;
    setLoading(true);

    try {
      const res = await fetch(`${SERVER_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const json = await res.json() as { success: boolean; data?: { user: User; tokens: AuthTokens }; error?: { message: string } };

      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? 'Login failed');
      }

      setAuth(json.data.user, json.data.tokens);
      router.replace('/(app)/chat');
    } catch (err) {
      Alert.alert('Login Failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  }, [username, password, setAuth, router]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>W</Text>
          </View>
          <Text style={styles.appName}>WASP</Text>
          <Text style={styles.tagline}>We Are Signal Protocol</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="your_username"
              placeholderTextColor="#9CA3AF"
              returnKeyType="next"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              returnKeyType="done"
              onSubmitEditing={() => void handleLogin()}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => void handleLogin()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/register')}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>
              Don&apos;t have an account? <Text style={styles.linkTextBold}>Create one</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.privacyNote}>
          🔒 End-to-end encrypted · Open source · Zero data collection
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#16a34a' },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoText: { fontSize: 36, fontWeight: 'bold', color: 'white' },
  appName: { fontSize: 32, fontWeight: 'bold', color: 'white', letterSpacing: 2 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  form: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827',
  },
  button: {
    backgroundColor: '#22c55e', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontWeight: '700', fontSize: 16 },
  linkButton: { alignItems: 'center', marginTop: 18 },
  linkText: { color: '#6B7280', fontSize: 14 },
  linkTextBold: { color: '#16a34a', fontWeight: '700' },
  privacyNote: { textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 24 },
});
