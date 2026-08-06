import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SettingsStore } from './settings';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memiarka-settings-'));
  file = join(dir, 'settings.json');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('SettingsStore', () => {
  test('brak pliku → domyślnie autoAds = true', () => {
    expect(new SettingsStore(file).autoAds).toBe(true);
  });

  test('setAutoAds zapisuje na dysk; nowa instancja wczytuje', () => {
    const store = new SettingsStore(file);
    store.setAutoAds(false);
    expect(store.autoAds).toBe(false);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ autoAds: false });
    expect(new SettingsStore(file).autoAds).toBe(false);
  });

  test('uszkodzony plik → domyślne wartości, bez wyjątku', () => {
    writeFileSync(file, 'to nie json{{{');
    expect(new SettingsStore(file).autoAds).toBe(true);
  });

  test('autoAds w pliku nie-boolean → domyślne true', () => {
    writeFileSync(file, JSON.stringify({ autoAds: 'nie' }));
    expect(new SettingsStore(file).autoAds).toBe(true);
  });

  test('brak katalogu → tworzony przy zapisie', () => {
    const nested = join(dir, 'nie-ma', 'settings.json');
    new SettingsStore(nested).setAutoAds(false);
    expect(new SettingsStore(nested).autoAds).toBe(false);
  });

  test('setAutoAds z tą samą wartością nie dotyka pliku', () => {
    const store = new SettingsStore(file);
    store.setAutoAds(true); // wartość domyślna — nic się nie zmienia
    expect(() => readFileSync(file, 'utf8')).toThrow(); // plik nie powstał
  });
});
