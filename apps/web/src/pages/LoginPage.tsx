import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import type { User, AuthTokens } from '@wasp/types';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        const result = await api.auth.login({ username, password }) as { user: User; tokens: AuthTokens };
        setAuth(result.user, result.tokens);
        void navigate('/chat');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    },
    [username, password, setAuth, navigate],
  );

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-wasp-600 to-wasp-800 p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-full bg-white/20 items-center justify-center mb-4">
            <span className="text-white text-3xl font-bold">W</span>
          </div>
          <h1 className="text-3xl font-bold text-white">WASP</h1>
          <p className="text-wasp-200 text-sm mt-1">We Are Signal Protocol</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-wasp-500 focus:border-transparent outline-none transition"
                placeholder="your_username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-wasp-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-wasp-500 hover:bg-wasp-600 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-wasp-600 dark:text-wasp-400 font-semibold hover:underline">
              Create one
            </Link>
          </p>
        </div>

        {/* Privacy note */}
        <p className="text-center text-wasp-200 text-xs mt-6">
          🔒 End-to-end encrypted · Zero server storage · Open source
        </p>
      </div>
    </div>
  );
}
