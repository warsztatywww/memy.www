import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SpecialMode } from './specials/index';
import { StatusPoller } from './status-poller';

const mode = (id: string, fetchData: () => Promise<unknown>): SpecialMode => ({
  id,
  duration: 15_000,
  fetchData,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('StatusPoller', () => {
  test('pierwszy tick od razu po start(), getData zwraca snapshot, emit update', async () => {
    const poller = new StatusPoller([mode('a', async () => ({ v: 1 }))], 5000);
    let updates = 0;
    poller.on('update', () => updates++);
    expect(poller.getData('a')).toBeNull(); // przed pierwszym tickiem
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getData('a')).toEqual({ v: 1 });
    expect(updates).toBe(1);
    poller.stop();
  });

  test('bez emitu gdy dane bez zmian; emit przy zmianie', async () => {
    let v = 1;
    const poller = new StatusPoller([mode('a', async () => ({ v }))], 5000);
    let updates = 0;
    poller.on('update', () => updates++);
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toBe(1);
    await vi.advanceTimersByTimeAsync(5000); // te same dane
    expect(updates).toBe(1);
    v = 2;
    await vi.advanceTimersByTimeAsync(5000);
    expect(updates).toBe(2);
    expect(poller.getData('a')).toEqual({ v: 2 });
    poller.stop();
  });

  test('wyjątek z fetchData nie zatrzymuje pollingu, stary snapshot zostaje', async () => {
    let fail = false;
    let v = 1;
    const poller = new StatusPoller(
      [mode('a', async () => { if (fail) throw new Error('awaria'); return { v }; })],
      5000,
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    fail = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(poller.getData('a')).toEqual({ v: 1 }); // stary snapshot
    fail = false;
    v = 3;
    await vi.advanceTimersByTimeAsync(5000);
    expect(poller.getData('a')).toEqual({ v: 3 }); // polling żyje
    poller.stop();
  });

  test('polluje wiele specials naraz; getData nieznanego id → null', async () => {
    const poller = new StatusPoller(
      [mode('a', async () => 'A'), mode('b', async () => 'B')],
      5000,
    );
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.getData('a')).toBe('A');
    expect(poller.getData('b')).toBe('B');
    expect(poller.getData('nope')).toBeNull();
    poller.stop();
  });
});
