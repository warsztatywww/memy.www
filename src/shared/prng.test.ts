import { describe, expect, test } from 'vitest';
import { mulberry32 } from './prng';

describe('mulberry32', () => {
  test('ten sam seed daje tę samą sekwencję', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  test('różne seedy dają różne sekwencje', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  test('wartości w [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
