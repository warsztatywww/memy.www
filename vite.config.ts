import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: fileURLToPath(new URL('src/client/index.html', import.meta.url)),
        player: fileURLToPath(new URL('src/client/player.html', import.meta.url)),
      },
    },
  },
});
