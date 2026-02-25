import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Resolve workspace packages directly to their TypeScript source in dev,
// so Vite doesn't need a pre-built dist/ folder.
const packagesRoot = path.resolve(__dirname, '../../packages');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@wasp/crypto': path.resolve(packagesRoot, 'crypto/src/index.ts'),
      '@wasp/types': path.resolve(packagesRoot, 'types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/keys': 'http://localhost:3000',
      '/users': 'http://localhost:3000',
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'crypto': ['@wasp/crypto'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['@noble/curves', '@noble/hashes', '@noble/ciphers'],
  },
});
