import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, HistoryMessage } from '../shared/types';
import type { Config } from './config';
import { MediaLibrary } from './library';
import { Radio } from './radio';
import { specials } from './specials/index';

export interface App {
  server: http.Server;
  radio: Radio;
  stop(): Promise<void>;
}

export async function createApp(config: Config): Promise<App> {
  mkdirSync(config.mediaDir, { recursive: true });
  mkdirSync(config.adsDir, { recursive: true });

  const memes = new MediaLibrary(config.mediaDir);
  const ads = new MediaLibrary(config.adsDir, { videosOnly: true });
  await Promise.all([memes.start(), ads.start()]);

  const radio = new Radio({
    memes,
    ads,
    specials,
    config: {
      imageDurationMs: config.imageDurationMs,
      adInterval: config.adInterval,
      specialIntervalMs: config.specialIntervalMs,
      historySize: config.historySize,
    },
  });

  const distClient = join(process.cwd(), 'dist/client');
  const app = express();
  app.use(express.static(distClient));
  app.get('/player', (_req, res) => res.sendFile(join(distClient, 'player.html')));
  app.use('/media', express.static(config.mediaDir));
  app.use('/ads', express.static(config.adsDir));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const historyMessage = (): HistoryMessage => ({ type: 'history', entries: radio.history() });
  const broadcast = (msg: unknown): void => {
    const raw = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(raw);
    }
  };

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify(radio.stateMessage()));
    ws.send(JSON.stringify(historyMessage()));
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', t0: msg.t0, serverTime: Date.now() }));
      } else if (msg.type === 'playAd') {
        radio.playAdNow();
      } else if (msg.type === 'stopAd') {
        radio.stopAd();
      }
    });
  });

  radio.on('update', () => {
    broadcast(radio.stateMessage());
    broadcast(historyMessage());
  });
  radio.start();

  return {
    server,
    radio,
    async stop(): Promise<void> {
      radio.stop();
      wss.close();
      await new Promise<void>((res) => server.close(() => res()));
      await Promise.all([memes.stop(), ads.stop()]);
    },
  };
}
