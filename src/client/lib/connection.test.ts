import { describe, expect, test, vi } from 'vitest';
import { createBootTracker } from './connection';

describe('createBootTracker', () => {
  test('pierwszy bootId tylko zapamiętuje, nic nie robi', () => {
    const onRestart = vi.fn();
    const track = createBootTracker(onRestart);
    track('abc');
    expect(onRestart).not.toHaveBeenCalled();
  });

  test('ten sam bootId po reconnekcie nie wywołuje restartu', () => {
    const onRestart = vi.fn();
    const track = createBootTracker(onRestart);
    track('abc');
    track('abc');
    track('abc');
    expect(onRestart).not.toHaveBeenCalled();
  });

  test('zmieniony bootId wywołuje restart', () => {
    const onRestart = vi.fn();
    const track = createBootTracker(onRestart);
    track('abc');
    track('xyz');
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
