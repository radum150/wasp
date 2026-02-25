import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User, AuthTokens } from '@wasp/types';

interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  setAuth: (user: User, tokens: AuthTokens) => void;
  updateTokens: (tokens: Partial<AuthTokens>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,
      setAuth: (user, tokens) => set({ user, tokens, isAuthenticated: true }),
      updateTokens: (tokens) =>
        set((state) => ({ tokens: state.tokens ? { ...state.tokens, ...tokens } : null })),
      logout: () => set({ user: null, tokens: null, isAuthenticated: false }),
    }),
    {
      name: 'wasp-auth',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
