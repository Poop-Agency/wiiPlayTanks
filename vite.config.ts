import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/**
 * Vite ne sert que le client. Le serveur de jeu (`src/server/`) tourne
 * séparément sous Bun et n'est jamais bundlé ici — c'est ce qui garantit que
 * `src/core/` reste exécutable des deux côtés sans passer par un bundler.
 */
const resolvePath = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolvePath('./src/core'),
      '@shared': resolvePath('./src/shared'),
      '@client': resolvePath('./src/client'),
    },
  },
  server: {
    port: 5173,
    // Le serveur de jeu Bun écoute sur 8080 ; en dev, Vite lui relaie les
    // connexions WebSocket pour que le client utilise une seule origine.
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
  },
});
