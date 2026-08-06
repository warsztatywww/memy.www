import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  ClientMessage,
  HistoryMessage,
  PantryData,
  ShowersData,
  StatusMessage,
  TickerMessage,
} from '../shared/types';
import { REPORT_REASONS } from '../shared/types';
import type { Config } from './config';
import { MediaLibrary } from './library';
import { Radio } from './radio';
import { createSpecials } from './specials/index';
import { SettingsStore } from './settings';
import { StatusPoller } from './status-poller';
import { TickerStore } from './ticker';
import { moveToTrash } from './trash';
import { uploadHandler } from './upload';

export interface App {
  server: http.Server;
  radio: Radio;
  stop(): Promise<void>;
}

export async function createApp(config: Config, opts: { fetchFn?: typeof fetch } = {}): Promise<App> {
  mkdirSync(config.mediaDir, { recursive: true });
  mkdirSync(config.adsDir, { recursive: true });

  const memes = new MediaLibrary(config.mediaDir);
  const ads = new MediaLibrary(config.adsDir, { videosOnly: true });
  await Promise.all([memes.start(), ads.start()]);

  const specials = createSpecials(config.haToken, opts.fetchFn);
  const poller = new StatusPoller(specials, config.statusIntervalMs);
  const ticker = new TickerStore(join(config.dataDir, 'ticker.json'));
  const settings = new SettingsStore(join(config.dataDir, 'settings.json'));

  const radio = new Radio({
    memes,
    ads,
    specials: specials.map(({ id, duration }) => ({ id, duration })),
    getSpecialData: (id) => poller.getData(id),
    config: {
      imageDurationMs: config.imageDurationMs,
      adInterval: config.adInterval,
      specialIntervalMs: config.specialIntervalMs,
      historySize: config.historySize,
    },
    autoAds: settings.autoAds,
  });

  const distClient = join(process.cwd(), 'dist/client');
  const app = express();
  app.use(express.static(distClient));
  app.get('/player', (_req, res) => res.sendFile(join(distClient, 'player.html')));
  app.use('/media', express.static(config.mediaDir));
  app.use('/ads', express.static(config.adsDir));
  app.post('/api/upload', uploadHandler(config.mediaDir));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const historyMessage = (): HistoryMessage => ({ type: 'history', entries: radio.history() });
  const tickerMessage = (): TickerMessage => ({ type: 'ticker', messages: ticker.messages() });
  const statusMessage = (): StatusMessage | null => {
    const pantry = poller.getData('pantry') as PantryData | null;
    const showers = poller.getData('showers') as ShowersData | null;
    return pantry && showers ? { type: 'status', pantry, showers } : null;
  };
  const broadcast = (msg: unknown): void => {
    const raw = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(raw);
    }
  };

  const handleReport = async (file: string, reason: string): Promise<void> => {
    if (!memes.get(file)) return; // już zgłoszony / nieznany — ignorujemy
    try {
      await moveToTrash(config.mediaDir, file);
    } catch (err) {
      console.warn(`[report] nie udało się przenieść ${file} do kosza:`, err instanceof Error ? err.message : err);
      return;
    }
    memes.remove(file);
    radio.dropQueued(file);
    const { item } = radio.stateMessage();
    if ((item.kind === 'image' || item.kind === 'video') && item.name === file) radio.skip();
    console.log(`[report] „${file}" zgłoszony: ${reason}`);
  };

  wss.on('connection', (ws) => {
    ws.on('error', (err) => console.warn('[ws] client error:', err.message));
    ws.send(JSON.stringify(radio.stateMessage()));
    ws.send(JSON.stringify(historyMessage()));
    ws.send(JSON.stringify(tickerMessage()));
    const status = statusMessage();
    if (status) ws.send(JSON.stringify(status));
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
      } else if (msg.type === 'skip') {
        radio.skip();
      } else if (msg.type === 'setAutoAds' && typeof msg.enabled === 'boolean') {
        settings.setAutoAds(msg.enabled);
        radio.setAutoAds(msg.enabled);
      } else if (msg.type === 'addTicker' && typeof msg.text === 'string') {
        ticker.add(msg.text);
      } else if (msg.type === 'removeTicker' && typeof msg.id === 'string') {
        ticker.remove(msg.id);
      } else if (
        msg.type === 'report' &&
        typeof msg.file === 'string' &&
        (REPORT_REASONS as readonly string[]).includes(msg.reason)
      ) {
        void handleReport(msg.file, msg.reason);
      }
    });
  });

  radio.on('update', () => {
    broadcast(radio.stateMessage());
    broadcast(historyMessage());
  });
  poller.on('update', () => {
    const status = statusMessage();
    if (status) broadcast(status);
  });
  ticker.on('update', () => broadcast(tickerMessage()));
  poller.start();
  radio.start();

  let stopped = false;

  return {
    server,
    radio,
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      radio.stop();
      poller.stop();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((res) => server.close(() => res()));
      await Promise.all([memes.stop(), ads.stop()]);
    },
  };
}
