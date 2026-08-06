import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { TickerStore } from './ticker';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memiarka-ticker-'));
  file = join(dir, 'ticker.json');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('TickerStore', () => {
  test('add nadaje id, emituje update, remove usuwa', () => {
    const store = new TickerStore(file);
    let updates = 0;
    store.on('update', () => updates++);
    store.add('Pierwszy komunikat');
    store.add('Drugi');
    expect(updates).toBe(2);
    const msgs = store.messages();
    expect(msgs.map((m) => m.text)).toEqual(['Pierwszy komunikat', 'Drugi']);
    expect(new Set(msgs.map((m) => m.id)).size).toBe(2);
    store.remove(msgs[0].id);
    expect(updates).toBe(3);
    expect(store.messages().map((m) => m.text)).toEqual(['Drugi']);
  });

  test('pusty/białe znaki ignorowane, tekst przycinany do 500 znaków', () => {
    const store = new TickerStore(file);
    let updates = 0;
    store.on('update', () => updates++);
    store.add('   ');
    store.add('');
    expect(updates).toBe(0);
    store.add('  x'.padEnd(600, 'y'));
    expect(store.messages()[0].text.length).toBeLessThanOrEqual(500);
  });

  test('remove nieznanego id = no-op bez emitu', () => {
    const store = new TickerStore(file);
    store.add('a');
    let updates = 0;
    store.on('update', () => updates++);
    store.remove('nie-ma-takiego');
    expect(updates).toBe(0);
    expect(store.messages()).toHaveLength(1);
  });

  test('persystencja: nowa instancja wczytuje zapisane komunikaty', () => {
    const store = new TickerStore(file);
    store.add('przetrwam restart');
    const again = new TickerStore(file);
    expect(again.messages().map((m) => m.text)).toEqual(['przetrwam restart']);
    // plik jest poprawnym JSON-em
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
  });

  test('uszkodzony plik → pusta lista, bez wyjątku', () => {
    writeFileSync(file, 'to nie json{{{');
    const store = new TickerStore(file);
    expect(store.messages()).toEqual([]);
  });

  test('brak pliku → pusta lista', () => {
    const store = new TickerStore(join(dir, 'nie-istnieje', 'ticker.json'));
    expect(store.messages()).toEqual([]);
    store.add('tworzy katalog przy zapisie');
    const again = new TickerStore(join(dir, 'nie-istnieje', 'ticker.json'));
    expect(again.messages()).toHaveLength(1);
  });
});
