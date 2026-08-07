import { describe, expect, test, vi } from 'vitest';
import { createFailureLog } from './failure-log';

describe('createFailureLog', () => {
  test('pierwsza awaria loguje treść błędu', () => {
    const warn = vi.fn();
    const note = createFailureLog('pantry', warn);
    note('ser', new Error('ENOTFOUND'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('[pantry]');
    expect(warn.mock.calls[0][0]).toContain('ser');
    expect(warn.mock.calls[0][0]).toContain('ENOTFOUND');
  });

  test('ta sama awaria w kółko loguje się tylko raz', () => {
    const warn = vi.fn();
    const note = createFailureLog('pantry', warn);
    note('ser', new Error('ENOTFOUND'));
    note('ser', new Error('ENOTFOUND'));
    note('ser', new Error('ENOTFOUND'));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('zmiana błędu loguje się na nowo', () => {
    const warn = vi.fn();
    const note = createFailureLog('pantry', warn);
    note('ser', new Error('ENOTFOUND'));
    note('ser', new Error('HTTP 502'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('każde źródło ma własną serię', () => {
    const warn = vi.fn();
    const note = createFailureLog('pantry', warn);
    note('ser', new Error('ENOTFOUND'));
    note('mleko', new Error('ENOTFOUND'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('powrót do zdrowia melduje się raz', () => {
    const warn = vi.fn();
    const note = createFailureLog('pantry', warn);
    note('ser', new Error('ENOTFOUND'));
    note('ser', null);
    note('ser', null);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toContain('znów odpowiada');
  });

  test('sukces bez wcześniejszej awarii nie loguje nic', () => {
    const warn = vi.fn();
    const note = createFailureLog('pantry', warn);
    note('ser', null);
    expect(warn).not.toHaveBeenCalled();
  });
});
