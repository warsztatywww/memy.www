import { describe, expect, test } from 'vitest';
import type { PantryData } from '../../shared/types';
import { createPantrySpecial, parseStatus } from './pantry';

describe('parseStatus', () => {
  test('mapowanie komunikatów', () => {
    expect(parseStatus('Otóż TAK!!!')).toBe('ok');
    expect(parseStatus('Już prawie nie ma, @Piotr kup ser')).toBe('low');
    expect(parseStatus('Już prawie nie ma')).toBe('low');
    expect(parseStatus('SER SIĘ SKOŃCZYŁ!!!!!!!!!!!!1111111jedenjeden')).toBe('out');
    expect(parseStatus('JEMY PŁATKI Z KAWĄ!!!!!!!!!!!!1111111jedenjeden')).toBe('out');
    expect(parseStatus('cokolwiek innego')).toBe('out');
  });
});

describe('createPantrySpecial', () => {
  test('pobiera trzy statusy równolegle', async () => {
    const responses: Record<string, string> = {
      'http://czyjestser.www22.duck.edu.pl/ser.txt': 'Otóż TAK!!!',
      'http://czyjestmleko.www22.duck.edu.pl/mleko.txt': 'Już prawie nie ma',
      'http://czyjestchlebtostowy.www22.duck.edu.pl/chleb.txt': 'GŁODÓWKA NIE MA TOSTÓW!!!',
    };
    const fakeFetch = (async (url: unknown) =>
      new Response(responses[String(url)])) as typeof fetch;
    const data = (await createPantrySpecial(fakeFetch).fetchData()) as PantryData;
    expect(data.ser).toEqual({ status: 'ok', text: 'Otóż TAK!!!' });
    expect(data.mleko).toEqual({ status: 'low', text: 'Już prawie nie ma' });
    expect(data.chleb).toEqual({ status: 'out', text: 'GŁODÓWKA NIE MA TOSTÓW!!!' });
  });

  test('błąd sieci daje status unknown, reszta działa', async () => {
    const fakeFetch = (async (url: unknown) => {
      if (String(url).includes('mleko')) throw new Error('ECONNREFUSED');
      return new Response('Otóż TAK!!!');
    }) as typeof fetch;
    const data = (await createPantrySpecial(fakeFetch).fetchData()) as PantryData;
    expect(data.ser.status).toBe('ok');
    expect(data.mleko).toEqual({ status: 'unknown', text: '???' });
    expect(data.chleb.status).toBe('ok');
  });

  test('HTTP != 200 daje unknown', async () => {
    const fakeFetch = (async () => new Response('err', { status: 500 })) as typeof fetch;
    const data = (await createPantrySpecial(fakeFetch).fetchData()) as PantryData;
    expect(data.ser.status).toBe('unknown');
  });
});
