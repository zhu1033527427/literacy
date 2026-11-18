import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';

export default defineConfig({
  plugins: [uni()],
  server: {
    host: true, // 或 '0.0.0.0'
    port: 80,
    fs: {
      allow: ['..'],
    },
    watch: {
      followSymlinks: true,
    },
  },
  optimizeDeps: {
    exclude: ['@literacy/shared-config', '@literacy/shared-types'],
  },
});
