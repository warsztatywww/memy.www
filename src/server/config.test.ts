import { describe, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { loadConfig } from './config';

describe('loadConfig', () => {
  test('domyślne wartości', () => {
    const c = loadConfig({ HA_TOKEN: 't' });
    expect(c.port).toBe(8080);
    expect(c.imageDurationMs).toBe(10_000);
    expect(c.adInterval).toBe(10);
    expect(c.specialIntervalMs).toBe(300_000);
    expect(c.historySize).toBe(50);
    expect(c.haToken).toBe('t');
    expect(c.mediaDir.endsWith('media')).toBe(true);
    expect(c.adsDir.endsWith('ads')).toBe(true);
  });

  test('nadpisywanie z env', () => {
    const c = loadConfig({ PORT: '3000', IMAGE_DURATION: '5', AD_INTERVAL: '4', SPECIAL_INTERVAL: '60', HISTORY_SIZE: '10', MEDIA_DIR: '/m', ADS_DIR: '/a', HA_TOKEN: 't' });
    expect(c).toMatchObject({ port: 3000, imageDurationMs: 5000, adInterval: 4, specialIntervalMs: 60_000, historySize: 10, mediaDir: '/m', adsDir: '/a', haToken: 't' });
  });

  test('śmieciowe wartości → domyślne', () => {
    const c = loadConfig({ PORT: 'abc', IMAGE_DURATION: '-5', HA_TOKEN: 't' });
    expect(c.port).toBe(8080);
    expect(c.imageDurationMs).toBe(10_000);
  });

  test('brak lub pusty HA_TOKEN → błąd startu', () => {
    expect(() => loadConfig({})).toThrow(/HA_TOKEN/);
    expect(() => loadConfig({ HA_TOKEN: '   ' })).toThrow(/HA_TOKEN/);
  });
});

describe('status i dane trwałe', () => {
  test('domyślne statusIntervalMs=5000 i dataDir=./data', () => {
    const c = loadConfig({ HA_TOKEN: 't' });
    expect(c.statusIntervalMs).toBe(5000);
    expect(c.dataDir).toBe(resolve('./data'));
  });

  test('STATUS_INTERVAL i DATA_DIR z env', () => {
    const c = loadConfig({ HA_TOKEN: 't', STATUS_INTERVAL: '10', DATA_DIR: '/tmp/memiarka-dane' });
    expect(c.statusIntervalMs).toBe(10_000);
    expect(c.dataDir).toBe('/tmp/memiarka-dane');
  });
});
