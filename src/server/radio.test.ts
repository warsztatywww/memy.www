import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mulberry32 } from '../shared/prng';
import type { StateMessage } from '../shared/types';
import type { MediaItem, MediaSource } from './library';
import { Radio, type RadioConfig } from './radio';
import type { SpecialMode } from './specials/index';

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
  specials?: SpecialMode[];
  config?: Partial<RadioConfig>;
} = {}) {
  const memes = new FakeSource(opts.memes ?? []);
  const ads = new FakeSource(opts.ads ?? []);
  const radio = new Radio({
    memes,
    ads,
    specials: opts.specials ?? [],
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
