import { describe, expect, test, vi } from 'vitest';
import { createFailureLog, describeError } from './failure-log';

describe('describeError', () => {
  test('rozwija cause — „fetch failed" samo w sobie nic nie mówi', () => {
    const cause = Object.assign(new Error('getaddrinfo EAI_AGAIN smart.www22.duck.edu.pl'), {
      code: 'EAI_AGAIN',
    });
    const err = new Error('fetch failed', { cause });
    expect(describeError(err)).toBe('fetch failed ← getaddrinfo EAI_AGAIN smart.www22.duck.edu.pl');
  });

  test('kod błędu spoza treści dokleja się w nawiasie', () => {
    const cause = Object.assign(new Error('Client network socket disconnected'), {
      code: 'ECONNRESET',
    });
    expect(describeError(new Error('fetch failed', { cause }))).toBe(
      'fetch failed ← Client network socket disconnected (ECONNRESET)',
    );
  });

  test('kod błędu już obecny w treści nie dubluje się', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 192.168.55.152:80'), {
      code: 'ECONNREFUSED',
    });
    expect(describeError(err)).toBe('connect ECONNREFUSED 192.168.55.152:80');
  });

  test('AggregateError wypisuje błędy składowe', () => {
    const agg = new AggregateError(
      [new Error('connect ECONNREFUSED 192.168.55.152:80'), new Error('connect EHOSTUNREACH')],
      '',
    );
    const out = describeError(new Error('fetch failed', { cause: agg }));
    expect(out).toContain('ECONNREFUSED');
    expect(out).toContain('EHOSTUNREACH');
  });

  test('nie-Error opisuje się przez String()', () => {
    expect(describeError('coś poszło nie tak')).toBe('coś poszło nie tak');
  });

  test('cykliczne cause nie zapętla logu', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    expect(describeError(b).split(' ← ')).toHaveLength(4);
  });
});

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
