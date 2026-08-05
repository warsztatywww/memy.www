import { describe, expect, test } from 'vitest';
import { parseDuration } from './ffprobe';

describe('parseDuration', () => {
  test('parsuje sekundy na ms', () => {
    expect(parseDuration('8.016000\n')).toBe(8016);
  });
  test('rzuca na śmieciach', () => {
    expect(() => parseDuration('N/A')).toThrow();
    expect(() => parseDuration('')).toThrow();
    expect(() => parseDuration('-3')).toThrow();
  });
});
