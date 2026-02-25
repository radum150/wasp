import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { cryptoManager } from '../lib/cryptoManager';
import type { User, AuthTokens } from '@wasp/types';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', confirm: '', phone: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (form.password !== form.confirm) {
        setError('Passwords do not match');
        return;
      }
      if (form.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }

      setLoading(true);

      try {
        // Initialize crypto (generates identity key if not exists)
        await cryptoManager.initialize();
        const registrationId = cryptoManager.getRegistrationId();

        const result = await api.auth.register({
          username: form.username,
          password: form.password,
          displayName: form.displayName,
          phoneNumber: form.phone || undefined,
          registrationId,
        }) as { user: User; tokens: AuthTokens };

        setAuth(result.user, result.tokens);

        // Upload initial keys to server
        await cryptoManager.uploadInitialKeys();

        void navigate('/chat');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
      } finally {
        setLoading(false);
      }
    },
    [form, setAuth, navigate],
  );

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-wasp-600 to-wasp-800 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-full bg-white/20 items-center justify-center mb-4">
            <span className="text-white text-3xl font-bold">W</span>
          </div>
          <h1 className="text-3xl font-bold text-white">WASP</h1>
          <p className="text-wasp-200 text-sm mt-1">We Are Signal Protocol</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Create account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.username}
                onChange={update('username')}
                required
                pattern="[a-zA-Z0-9_.\-]+"
                minLength={3}
                maxLength={32}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-wasp-500 focus:border-transparent outline-none"
                placeholder="cool_username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.displayName}
                onChange={update('displayName')}
                required
                maxLength={64}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-wasp-500 focus:border-transparent outline-none"
                placeholder="Your Name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone (optional)
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={update('phone')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-wasp-500 focus:border-transparent outline-none"
                placeholder="+1 555 000 0000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={update('password')}
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-wasp-500 focus:border-transparent outline-none"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={form.confirm}
                onChange={update('confirm')}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-wasp-500 focus:border-transparent outline-none"
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
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-wasp-600 dark:text-wasp-400 font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
