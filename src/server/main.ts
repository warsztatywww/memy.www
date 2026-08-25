import { createApp } from './app';
import { loadConfig } from './config';

// Sekrety (HA_TOKEN) z .env w katalogu roboczym — w dev. W kontenerze pliku nie ma,
// zmienne wstrzykuje docker compose (env_file), więc brak .env to nie błąd.
try {
  process.loadEnvFile();
} catch {
  // brak .env — jedziemy na tym, co już jest w środowisku
}

const config = loadConfig();
const app = await createApp(config);
app.server.listen(config.port, () => {
  console.log(`memiarka: panel http://localhost:${config.port}/ | player http://localhost:${config.port}/player`);
  console.log(`memy: ${config.mediaDir} | reklamy: ${config.adsDir}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void app.stop().then(() => process.exit(0));
  });
}
