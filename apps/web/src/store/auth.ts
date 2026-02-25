/**
 * Auth store — manages authentication state, tokens, and the local identity key.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, AuthTokens } from '@wasp/types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;

  setAuth: (user: User, tokens: AuthTokens) => void;
  updateTokens: (tokens: Partial<AuthTokens>) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,

      setAuth: (user, tokens) =>
        set({ user, tokens, isAuthenticated: true }),

      updateTokens: (tokens) =>
        set((state) => ({
          tokens: state.tokens ? { ...state.tokens, ...tokens } : null,
        })),

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      logout: () => set({ user: null, tokens: null, isAuthenticated: false }),
    }),
    {
      name: 'wasp-auth',
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
