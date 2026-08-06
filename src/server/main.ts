import { createApp } from './app';
import { loadConfig } from './config';

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
