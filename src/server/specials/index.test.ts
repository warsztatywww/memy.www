import { describe, expect, test } from 'vitest';
import { createSpecials } from './index';

describe('createSpecials', () => {
  test('rejestruje pantry i showers', () => {
    expect(createSpecials('t').map((s) => s.id)).toEqual(['pantry', 'showers']);
  });
});
