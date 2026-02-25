import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthGuard } from './components/AuthGuard';
import { LoadingScreen } from './components/ui/LoadingScreen';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/chat" replace />,
  },
  {
    path: '/login',
    element: (
      <Lazy>
        <LoginPage />
      </Lazy>
    ),
  },
  {
    path: '/register',
    element: (
      <Lazy>
        <RegisterPage />
      </Lazy>
    ),
  },
  {
    path: '/chat',
    element: (
      <AuthGuard>
        <Lazy>
          <ChatPage />
        </Lazy>
      </AuthGuard>
    ),
  },
  {
    path: '/chat/:conversationId',
    element: (
      <AuthGuard>
        <Lazy>
          <ChatPage />
        </Lazy>
      </AuthGuard>
    ),
  },
  {
    path: '/settings',
    element: (
      <AuthGuard>
        <Lazy>
          <SettingsPage />
        </Lazy>
      </AuthGuard>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/chat" replace />,
  },
]);
