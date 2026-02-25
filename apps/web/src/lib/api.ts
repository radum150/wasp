/**
 * API client for the WASP relay server.
 */

import { useAuthStore } from '../store/auth';

// In dev, Vite proxies /auth, /keys, /users → localhost:3000.
// In production the server serves the web build, so same-origin requests work
// with an empty base URL. Override with VITE_SERVER_URL only if hosting separately.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? '';

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { tokens, logout, updateTokens } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  let response = await fetch(`${SERVER_URL}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (response.status === 401 && tokens?.refreshToken) {
    const refreshRes = await fetch(`${SERVER_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json() as { success: boolean; data: { accessToken: string } };
      if (data.success) {
        updateTokens({ accessToken: data.data.accessToken });
        headers['Authorization'] = `Bearer ${data.data.accessToken}`;
        response = await fetch(`${SERVER_URL}${path}`, { ...options, headers });
      }
    } else {
      logout();
      throw new Error('Session expired — please log in again');
    }
  }

  const json = await response.json() as { success: boolean; data?: T; error?: { code: string; message: string } };

  if (!json.success) {
    throw new Error(json.error?.message ?? 'Request failed');
  }

  return json.data as T;
}

export const api = {
  auth: {
    register: (body: {
      username: string;
      password: string;
      displayName: string;
      phoneNumber?: string;
      registrationId: number;
    }) => request<{ user: unknown; tokens: unknown }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

    login: (body: { username: string; password: string }) =>
      request<{ user: unknown; tokens: unknown }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

    logout: (refreshToken: string) =>
      request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
  },

  users: {
    me: () => request<unknown>('/users/me'),
    update: (data: { displayName?: string; about?: string; avatarUrl?: string | null }) =>
      request<unknown>('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
    search: (q: string) => request<{ users: unknown[] }>(`/users/search?q=${encodeURIComponent(q)}`),
    getById: (id: string) => request<unknown>(`/users/${id}`),
  },

  keys: {
    getBundle: (userId: string) => request<{ bundle: unknown }>(`/keys/${userId}/bundle`),
    uploadBundle: (bundle: {
      registrationId: number;
      identitySigningPublicKey: string;
      identityDHPublicKey: string;
      signedPreKey: { keyId: number; publicKey: string; signature: string };
    }) => request('/keys/bundle', { method: 'POST', body: JSON.stringify(bundle) }),
    uploadPreKeys: (oneTimePreKeys: Array<{ keyId: number; publicKey: string }>) =>
      request<{ uploaded: number; totalRemaining: number }>('/keys/prekeys', {
        method: 'POST',
        body: JSON.stringify({ oneTimePreKeys }),
      }),
    getPreKeyCount: () => request<{ count: number; needsRefill: boolean }>('/keys/prekeys/count'),
  },
};
