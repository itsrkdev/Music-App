import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-saavn': {
        target: 'https://jiosaavn-api-v3.vercel.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-saavn/, ''),
      },
    },
  },
});