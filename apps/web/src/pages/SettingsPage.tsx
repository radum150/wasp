import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Bell, Moon, Shield, LogOut, ChevronRight, FlaskConical, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { wsClient } from '../lib/wsClient';
import { Avatar } from '../components/ui/Avatar';
import { cryptoManager } from '../lib/cryptoManager';
import { toHex } from '@wasp/crypto';
import { seedMockData, clearMockData } from '../lib/mockData';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
  const [mockFeedback, setMockFeedback] = useState<string | null>(null);

  const handleLogout = async () => {
    wsClient.disconnect();
    logout();
    void navigate('/login');
  };

  const toggleDarkMode = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  const safetyNumber = (() => {
    try {
      const ik = cryptoManager.getIdentityKey();
      const hex = toHex(ik.publicKey);
      return hex.match(/.{1,8}/g)?.join(' ') ?? hex;
    } catch {
      return 'Not initialized';
    }
  })();

  const sections = [
    {
      title: 'Account',
      items: [
        {
          icon: <Shield className="w-5 h-5 text-blue-500" />,
          label: 'Safety Number',
          description: 'Your unique cryptographic identity',
          onClick: () => alert(`Your Safety Number:\n\n${safetyNumber}\n\nShare this with contacts to verify your identity.`),
        },
        {
          icon: <Lock className="w-5 h-5 text-wasp-500" />,
          label: 'Privacy & Security',
          description: 'Last seen, read receipts, blocked contacts',
          onClick: () => console.info('TODO: Privacy settings'),
        },
      ],
    },
    {
      title: 'Notifications',
      items: [
        {
          icon: <Bell className="w-5 h-5 text-yellow-500" />,
          label: 'Notifications',
          description: 'Message, group, reaction alerts',
          onClick: () => console.info('TODO: Notification settings'),
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        {
          icon: <Moon className="w-5 h-5 text-indigo-500" />,
          label: 'Dark Mode',
          description: darkMode ? 'Currently dark' : 'Currently light',
          onClick: toggleDarkMode,
          right: (
            <div
              className={`w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-wasp-500' : 'bg-gray-300'}`}
              onClick={toggleDarkMode}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${darkMode ? 'translate-x-6' : 'translate-x-0.5'}`}
              />
            </div>
          ),
        },
      ],
    },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => void navigate(-1)}
          className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-lg text-gray-900 dark:text-white">Settings</h1>
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Profile card */}
        {user && (
          <div className="bg-white dark:bg-gray-800 px-4 py-5 flex items-center gap-4 border-b border-gray-200 dark:border-gray-700">
            <Avatar src={user.avatarUrl} name={user.displayName} size="lg" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">{user.displayName}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">@{user.username}</p>
            </div>
          </div>
        )}

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.title} className="mt-6">
            <p className="px-4 pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {section.title}
            </p>
            <div className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">{item.label}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
                  </div>
                  {item.right ?? <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Developer */}
        <div className="mt-6">
          <p className="px-4 pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Developer
          </p>
          <div className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
            <button
              onClick={() => {
                if (user) {
                  seedMockData(user.id);
                  setMockFeedback('Mock conversations loaded!');
                  setTimeout(() => setMockFeedback(null), 2500);
                  void navigate('/chat');
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-5 h-5 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">Load Mock Conversations</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Populate with sample chats for testing</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
            <button
              onClick={() => {
                clearMockData();
                setMockFeedback('Conversations cleared.');
                setTimeout(() => setMockFeedback(null), 2500);
              }}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white">Clear All Conversations</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Remove all local mock data</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </button>
          </div>
          {mockFeedback && (
            <p className="px-4 pt-2 text-sm text-wasp-600 dark:text-wasp-400 font-medium">{mockFeedback}</p>
          )}
        </div>

        {/* Logout */}
        <div className="mt-6 mb-8 px-4">
          <button
            onClick={() => void handleLogout()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors font-semibold"
          >
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>

        {/* Version info */}
        <p className="text-center text-xs text-gray-400 pb-8">
          WASP v0.1.0 · MIT License · Open Source
          <br />
          🔒 All messages encrypted with Signal Protocol
        </p>
      </div>
    </div>
  );
}
