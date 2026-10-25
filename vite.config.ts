import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    // three.js is most of the bundle; keep it in its own long-cached chunk.
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'three', test: /node_modules[\\/]three/ }] },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  worker: { format: 'es' },
});
