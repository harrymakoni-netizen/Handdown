import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@firebase/firestore')) return 'firebase-firestore';
          if (id.includes('@firebase/auth')) return 'firebase-auth';
          if (id.includes('@firebase/app-check')) return 'firebase-app-check';
        },
      },
    },
  },
});
