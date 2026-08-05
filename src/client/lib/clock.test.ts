import { describe, expect, test } from 'vitest';
import { SyncedClock, computeOffset, median } from './clock';

describe('computeOffset', () => {
  test('serwer idealnie w środku RTT', () => {
    // t0=1000, t1=1100 (RTT 100), serwer odpowiedział w 1050 wg własnego zegara
    // → zegary zgodne → offset 0
    expect(computeOffset(1000, 1050, 1100)).toBe(0);
  });
  test('serwer przesunięty o +500', () => {
    expect(computeOffset(1000, 1550, 1100)).toBe(500);
  });
});

describe('median', () => {
  test('nieparzysta liczba', () => expect(median([3, 1, 2])).toBe(2));
  test('parzysta liczba', () => expect(median([1, 2, 3, 4])).toBe(2.5));
  test('pusta rzuca', () => expect(() => median([])).toThrow());
});

describe('SyncedClock', () => {
  test('offset 0 bez próbek', () => {
    expect(new SyncedClock().offset).toBe(0);
  });
  test('mediana odrzuca outliera', () => {
    const c = new SyncedClock();
    c.addSample(1000, 1500, 1100); // offset 450
    c.addSample(2000, 2500, 2100); // offset 450
    c.addSample(3000, 9999, 3100); // outlier (offset 6949)
    expect(c.offset).toBe(450);
  });
  test('trzyma najwyżej 7 próbek (stare wypadają)', () => {
    const c = new SyncedClock();
    for (let i = 0; i < 7; i++) c.addSample(0, 1000, 0); // 7 × offset 1000
    for (let i = 0; i < 7; i++) c.addSample(0, 2000, 0); // wypierają: 7 × offset 2000
    expect(c.offset).toBe(2000);
  });
});
