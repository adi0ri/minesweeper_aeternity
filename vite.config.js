// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // proxy ANY path that starts with /compiler to the remote compiler
      '^/compiler/.*': {
        target: 'https://v8.compiler.aepps.com',
        changeOrigin: true,
        secure: true,
        // strip the /compiler prefix when forwarding
        rewrite: (path) => path.replace(/^\/compiler/, ''),
      },
      // also catch the bare `/compiler` hit some SDKs do first
      '/compiler': {
        target: 'https://v8.compiler.aepps.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
