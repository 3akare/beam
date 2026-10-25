import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only: POST /__capture?name=file.png saves the body into media-kit/ — used to grab
 * gallery screenshots and the demo video straight from the game's canvas.
 */
function capture(): Plugin {
  return {
    name: 'beam-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__capture', (req, res) => {
        const name = basename(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'capture.bin');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = join(server.config.root, 'media-kit');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [capture()],
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
