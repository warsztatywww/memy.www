import { describe, expect, test } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  test('domyślne wartości', () => {
    const c = loadConfig({});
    expect(c.port).toBe(8080);
    expect(c.imageDurationMs).toBe(10_000);
    expect(c.adInterval).toBe(10);
    expect(c.specialIntervalMs).toBe(300_000);
    expect(c.historySize).toBe(50);
    expect(c.mediaDir.endsWith('media')).toBe(true);
    expect(c.adsDir.endsWith('ads')).toBe(true);
  });

  test('nadpisywanie z env', () => {
    const c = loadConfig({ PORT: '3000', IMAGE_DURATION: '5', AD_INTERVAL: '4', SPECIAL_INTERVAL: '60', HISTORY_SIZE: '10', MEDIA_DIR: '/m', ADS_DIR: '/a' });
    expect(c).toMatchObject({ port: 3000, imageDurationMs: 5000, adInterval: 4, specialIntervalMs: 60_000, historySize: 10, mediaDir: '/m', adsDir: '/a' });
  });

  test('śmieciowe wartości → domyślne', () => {
    const c = loadConfig({ PORT: 'abc', IMAGE_DURATION: '-5' });
    expect(c.port).toBe(8080);
    expect(c.imageDurationMs).toBe(10_000);
  });
});
