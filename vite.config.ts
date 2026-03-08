import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isWebReplica = mode === 'web';

  return {
    plugins: [react()],

    clearScreen: false,

    server: {
      host: isWebReplica ? '127.0.0.1' : undefined,
      port: 1420,
      strictPort: true,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
      proxy: isWebReplica
        ? {
            '/api': {
              target: 'http://127.0.0.1:18888',
              changeOrigin: true,
            },
          }
        : undefined,
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        ...(isWebReplica
          ? {
              '@tauri-apps/api/core': path.resolve(__dirname, './src/shims/tauri-core-web.ts'),
              '@tauri-apps/plugin-shell': path.resolve(
                __dirname,
                './src/shims/tauri-shell-web.ts'
              ),
            }
          : {}),
      },
    },

    build: {
      ...(isWebReplica
        ? {
            outDir: 'web-console/app',
            emptyOutDir: true,
          }
        : {}),
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14',
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },

    envPrefix: ['VITE_', 'TAURI_ENV_'],
  };
});
