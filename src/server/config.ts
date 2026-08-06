import { resolve } from 'node:path';

export interface Config {
  port: number;
  mediaDir: string;
  adsDir: string;
  imageDurationMs: number;
  adInterval: number;
  specialIntervalMs: number;
  historySize: number;
  haToken: string;
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const haToken = (env.HA_TOKEN ?? '').trim();
  if (!haToken) {
    throw new Error('Brak HA_TOKEN (token Home Assistanta) — ustaw w docker-compose.yml albo w środowisku.');
  }
  return {
    port: num(env.PORT, 8080),
    mediaDir: resolve(env.MEDIA_DIR ?? './media'),
    adsDir: resolve(env.ADS_DIR ?? './ads'),
    imageDurationMs: num(env.IMAGE_DURATION, 10) * 1000,
    adInterval: num(env.AD_INTERVAL, 10),
    specialIntervalMs: num(env.SPECIAL_INTERVAL, 300) * 1000,
    historySize: num(env.HISTORY_SIZE, 50),
    haToken,
  };
}
