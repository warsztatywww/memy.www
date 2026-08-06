import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mulberry32 } from '../shared/prng';
import type { StateMessage } from '../shared/types';
import type { MediaItem, MediaSource } from './library';
import { Radio, type RadioConfig, type SpecialSlot } from './radio';

class FakeSource extends EventEmitter implements MediaSource {
  private map = new Map<string, MediaItem>();
  constructor(items: MediaItem[] = []) {
    super();
    for (const i of items) this.map.set(i.file, i);
  }
  items(): MediaItem[] { return [...this.map.values()]; }
  get(file: string): MediaItem | undefined { return this.map.get(file); }
  add(item: MediaItem): void { this.map.set(item.file, item); this.emit('added', item); }
  remove(file: string): void { this.map.delete(file); this.emit('removed', file); }
}

const img = (name: string): MediaItem => ({ file: name, path: `/x/${name}`, type: 'image' });
const vid = (name: string, ms: number): MediaItem => ({ file: name, path: `/x/${name}`, type: 'video', duration: ms });

const CONFIG: RadioConfig = {
  imageDurationMs: 10_000,
  adInterval: 3,
  specialIntervalMs: 300_000,
  historySize: 5,
};

function setup(opts: {
  memes?: MediaItem[];
  ads?: MediaItem[];
  specials?: SpecialSlot[];
  getSpecialData?: (id: string) => unknown;
  config?: Partial<RadioConfig>;
} = {}) {
  const memes = new FakeSource(opts.memes ?? []);
  const ads = new FakeSource(opts.ads ?? []);
  const radio = new Radio({
    memes,
    ads,
    specials: opts.specials ?? [],
    getSpecialData: opts.getSpecialData ?? ((id) => ({ d: id })),
    config: { ...CONFIG, ...opts.config },
    rng: mulberry32(42),
  });
  const states: StateMessage[] = [];
  radio.on('update', () => states.push(radio.stateMessage()));
  return { radio, memes, ads, states };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Radio: cykl memów', () => {
  test('gra memy bez powtórek w cyklu, obrazek trwa imageDurationMs', async () => {
    const { radio, states } = setup({ memes: [img('a.jpg'), img('b.jpg'), img('c.jpg')], config: { adInterval: 99 } });
    radio.start();
    expect(states).toHaveLength(1);
    expect(states[0].item.kind).toBe('image');
    expect(states[0].duration).toBe(10_000);
    await vi.advanceTimersByTimeAsync(20_000); // dwa kolejne przejścia
    const names = states.map((s) => s.item.name);
    expect(new Set(names).size).toBe(3);
    radio.stop();
  });

  test('film w katalogu memów gra swoją długość', async () => {
    const { radio, states } = setup({ memes: [vid('m.mp4', 7000)], config: { adInterval: 99 } });
    radio.start();
    expect(states[0].item).toMatchObject({ kind: 'video', url: '/media/m.mp4' });
    expect(states[0].duration).toBe(7000);
    radio.stop();
  });

  test('idle gdy brak memów', () => {
    const { radio, states } = setup();
    radio.start();
    expect(states[0].item.kind).toBe('idle');
    expect(states[0].duration).toBe(0);
    radio.stop();
  });

  test('NOWY MEM odtworzony natychmiast nie powtarza się w tym samym cyklu', async () => {
    const { radio, memes, states } = setup({ memes: [img('a.jpg')], config: { adInterval: 99 } });
    radio.start();
    expect(states[0].item.name).toBe('a.jpg');
    memes.add(img('b.jpg'));
    expect(states[1].item.name).toBe('b.jpg');
    expect(states[1].newMem).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(states[2].item.name).toBe('a.jpg');
    radio.stop();
  });
});

describe('Radio: reklamy', () => {
  test('reklama co adInterval elementów, z url /ads/', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg'), img('b.jpg'), img('c.jpg'), img('d.jpg')],
      ads: [vid('reklama.mp4', 5000)],
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(80_000);
    const kinds = states.map((s) => s.item.kind);
    // adInterval=3: po każdych 3 memach reklama
    expect(kinds.slice(0, 4)).toEqual(['image', 'image', 'image', 'ad']);
    const ad = states[3];
    expect(ad.item.url).toBe('/ads/reklama.mp4');
    expect(ad.duration).toBe(5000);
    // licznik się resetuje: po reklamie znowu 3 memy
    expect(kinds.slice(4, 8)).toEqual(['image', 'image', 'image', 'ad']);
    radio.stop();
  });

  test('brak reklam w katalogu = same memy', async () => {
    const { radio, states } = setup({ memes: [img('a.jpg'), img('b.jpg')] });
    radio.start();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(states.every((s) => s.item.kind === 'image')).toBe(true);
    radio.stop();
  });

  test('adsAvailable odzwierciedla stan katalogu reklam', () => {
    const { radio: r1 } = setup();
    r1.start();
    expect(r1.stateMessage().adsAvailable).toBe(false);
    r1.stop();
    const { radio: r2 } = setup({ ads: [vid('r.mp4', 1000)] });
    r2.start();
    expect(r2.stateMessage().adsAvailable).toBe(true);
    r2.stop();
  });
});

describe('Radio: historia', () => {
  test('historia od najnowszego, przycięta do historySize, bez idle', async () => {
    const { radio } = setup({ memes: [img('a.jpg'), img('b.jpg'), img('c.jpg')], config: { adInterval: 99, historySize: 5 } });
    radio.start();
    await vi.advanceTimersByTimeAsync(100_000); // 11 odtworzeń
    const h = radio.history();
    expect(h).toHaveLength(5);
    expect(h[0].playedAt).toBeGreaterThan(h[4].playedAt);
    expect(h.every((e) => e.kind === 'image')).toBe(true);
    radio.stop();
  });
});

describe('Radio: tryby specjalne', () => {
  const slot = (id: string): SpecialSlot => ({ id, duration: 15_000 });

  test('tryb wchodzi po interwale, po zakończeniu bieżącego elementu (bez preempcji)', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg'), img('b.jpg')],
      specials: [slot('pantry')],
      config: { adInterval: 99, specialIntervalMs: 25_000 },
    });
    radio.start(); // t=0: mem1 (10s), mem2 (10s), mem3 (10s) — interwał mija w t=25s, w trakcie mem3
    await vi.advanceTimersByTimeAsync(29_000);
    expect(states.at(-1)!.item.kind).toBe('image'); // mem3 się nie przerwał
    await vi.advanceTimersByTimeAsync(1_500); // t=30.5s: mem3 skończony → special
    const last = states.at(-1)!;
    expect(last.item.kind).toBe('special');
    expect(last.item.specialId).toBe('pantry');
    expect(last.item.data).toEqual({ d: 'pantry' }); // snapshot z getSpecialData
    expect(last.item.seed).toBeTypeOf('number');
    expect(last.duration).toBe(15_000);
    radio.stop();
  });

  test('round-robin przy wielu trybach', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      specials: [slot('one'), slot('two')],
      config: { adInterval: 99, specialIntervalMs: 15_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(120_000);
    const ids = states.filter((s) => s.item.kind === 'special').map((s) => s.item.specialId);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(ids[0]).toBe('one');
    expect(ids[1]).toBe('two');
    radio.stop();
  });

  test('getSpecialData zwraca null → slajd pominięty, grają memy', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg'), img('b.jpg')],
      specials: [slot('x')],
      getSpecialData: () => null,
      config: { adInterval: 99, specialIntervalMs: 5_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(states.every((s) => s.item.kind === 'image')).toBe(true);
    radio.stop();
  });

  test('po pominięciu slajd wraca, gdy dane się pojawią', async () => {
    let data: unknown = null;
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      specials: [slot('x')],
      getSpecialData: () => data,
      config: { adInterval: 99, specialIntervalMs: 5_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(30_000); // kilka pominięć
    expect(states.some((s) => s.item.kind === 'special')).toBe(false);
    data = { gotowe: true };
    await vi.advanceTimersByTimeAsync(30_000);
    const sp = states.find((s) => s.item.kind === 'special');
    expect(sp?.item.data).toEqual({ gotowe: true });
    radio.stop();
  });
});

describe('Radio: NOWY MEM', () => {
  test('nowy mem przerywa obrazek natychmiast, z newMem=true', async () => {
    const { radio, memes, states } = setup({ memes: [img('a.jpg')], config: { adInterval: 99 } });
    radio.start();
    await vi.advanceTimersByTimeAsync(3_000);
    memes.add(img('nowy.jpg'));
    const last = states.at(-1)!;
    expect(last.item.name).toBe('nowy.jpg');
    expect(last.newMem).toBe(true);
    radio.stop();
  });

  test('nowy mem wybudza z idle', async () => {
    const { radio, memes, states } = setup();
    radio.start();
    expect(states.at(-1)!.item.kind).toBe('idle');
    memes.add(img('pierwszy.jpg'));
    expect(states.at(-1)!).toMatchObject({ newMem: true, item: { name: 'pierwszy.jpg' } });
    radio.stop();
  });

  test('nowe memy podczas reklamy czekają w kolejce FIFO i grają po niej', async () => {
    const { radio, memes, states } = setup({
      memes: [img('a.jpg')],
      ads: [vid('reklama.mp4', 20_000)],
      config: { adInterval: 1 },
    });
    radio.start(); // mem a (10s) → reklama (20s)
    await vi.advanceTimersByTimeAsync(15_000); // w trakcie reklamy
    expect(states.at(-1)!.item.kind).toBe('ad');
    memes.add(img('q1.jpg'));
    memes.add(img('q2.jpg'));
    expect(states.at(-1)!.item.kind).toBe('ad'); // reklama NIE przerwana
    await vi.advanceTimersByTimeAsync(15_001); // reklama się kończy (t=30s) → q1
    expect(states.at(-1)!).toMatchObject({ newMem: true, item: { name: 'q1.jpg' } });
    await vi.advanceTimersByTimeAsync(10_001); // → q2
    expect(states.at(-1)!).toMatchObject({ newMem: true, item: { name: 'q2.jpg' } });
    radio.stop();
  });
});

describe('Radio: komendy panelu', () => {
  test('playAdNow przerywa bieżący element reklamą', async () => {
    const { radio, states } = setup({ memes: [img('a.jpg')], ads: [vid('r.mp4', 5_000)], config: { adInterval: 99 } });
    radio.start();
    await vi.advanceTimersByTimeAsync(2_000);
    radio.playAdNow();
    expect(states.at(-1)!.item).toMatchObject({ kind: 'ad', url: '/ads/r.mp4' });
    radio.stop();
  });

  test('playAdNow bez reklam = no-op', async () => {
    const { radio, states } = setup({ memes: [img('a.jpg')], config: { adInterval: 99 } });
    radio.start();
    const count = states.length;
    radio.playAdNow();
    expect(states.length).toBe(count);
    radio.stop();
  });

  test('skip przerywa mema', async () => {
    const { radio, states } = setup({ memes: [img('a.jpg'), img('b.jpg')], config: { adInterval: 99 } });
    radio.start();
    const count = states.length;
    radio.skip();
    expect(states.length).toBe(count + 1);
    expect(states.at(-1)!.item.kind).toBe('image');
    radio.stop();
  });

  test('skip przerywa tryb specjalny', async () => {
    const { radio, states } = setup({
      memes: [img('a.jpg')],
      specials: [{ id: 'x', duration: 15_000 }],
      config: { adInterval: 99, specialIntervalMs: 5_000 },
    });
    radio.start();
    await vi.advanceTimersByTimeAsync(10_001); // mem skończony → special
    expect(states.at(-1)!.item.kind).toBe('special');
    radio.skip();
    expect(states.at(-1)!.item.kind).toBe('image');
    radio.stop();
  });

  test('skip przerywa reklamę; kolejka nowych memów ma pierwszeństwo', async () => {
    const { radio, memes, states } = setup({
      memes: [img('a.jpg')],
      ads: [vid('r.mp4', 60_000)],
      config: { adInterval: 99 },
    });
    radio.start();
    radio.playAdNow();
    expect(states.at(-1)!.item.kind).toBe('ad');
    memes.add(img('swiezak.jpg')); // do kolejki
    radio.skip();
    expect(states.at(-1)!).toMatchObject({ newMem: true, item: { name: 'swiezak.jpg' } });
    radio.stop();
  });

  test('skip przy idle = no-op', () => {
    const { radio, states } = setup();
    radio.start();
    const count = states.length;
    radio.skip();
    expect(states.length).toBe(count);
    radio.stop();
  });
});
