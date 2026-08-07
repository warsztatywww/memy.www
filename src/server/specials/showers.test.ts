import { describe, expect, test } from 'vitest';
import type { ShowersData } from '../../shared/types';
import { createShowersSpecial } from './showers';

const TOKEN = 'test-token';

function haResponse(states: Record<string, string>): Response {
  const body = Object.entries(states).map(([entity_id, state]) => ({ entity_id, state }));
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

const FULL: Record<string, string> = {
  'switch.qwwwetek': 'on',
  'switch.qwwwetka': 'off',
  'switch.vipownia_wwwipownia': 'on',
  'light.somtasma': 'on',
  'select.somtasma_preset': 'Rainbow',
};

describe('createShowersSpecial', () => {
  test('mapuje światła i somtaśmę; brak czujników → occupancy unknown', async () => {
    const fakeFetch = (async () => haResponse(FULL)) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek).toEqual({ light: 'on', occupancy: 'unknown' });
    expect(data.qwwwetka).toEqual({ light: 'off', occupancy: 'unknown' });
    expect(data.wwwipownia).toEqual({ light: 'on', occupancy: 'unknown', somtasma: 'on', somtasmaPreset: 'Rainbow' });
  });

  test('wysyła token w nagłówku Authorization', async () => {
    let auth: string | undefined;
    const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
      auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return haResponse(FULL);
    }) as typeof fetch;
    await createShowersSpecial(TOKEN, fakeFetch).fetchData();
    expect(auth).toBe(`Bearer ${TOKEN}`);
  });

  test('czujniki obecności on/off → occupied/free', async () => {
    const fakeFetch = (async () =>
      haResponse({
        ...FULL,
        'binary_sensor.pir_t1_3_motion_2': 'on', // qWWWetek
        'binary_sensor.pir_t1_2_motion': 'off', // qWWWetka
      })) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek.occupancy).toBe('occupied');
    expect(data.qwwwetka.occupancy).toBe('free');
    expect(data.wwwipownia.occupancy).toBe('unknown');
  });

  test('czujnik WWWipownii nie miesza się z qWWWetkiem', async () => {
    const fakeFetch = (async () =>
      haResponse({
        ...FULL,
        'binary_sensor.pir_t1_3_motion': 'on', // WWWIPownia
        'binary_sensor.pir_t1_3_motion_2': 'off', // qWWWetek
      })) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.wwwipownia.occupancy).toBe('occupied');
    expect(data.qwwwetek.occupancy).toBe('free');
  });

  test('stan unavailable → unknown; preset unknown → null', async () => {
    const fakeFetch = (async () =>
      haResponse({
        'switch.qwwwetek': 'unavailable',
        'select.somtasma_preset': 'unknown',
      })) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek.light).toBe('unknown');
    expect(data.wwwipownia.somtasmaPreset).toBeNull();
  });

  test('HTTP != 200 → wszystko unknown', async () => {
    const fakeFetch = (async () => new Response('err', { status: 500 })) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data).toEqual({
      qwwwetek: { light: 'unknown', occupancy: 'unknown' },
      qwwwetka: { light: 'unknown', occupancy: 'unknown' },
      wwwipownia: { light: 'unknown', occupancy: 'unknown', somtasma: 'unknown', somtasmaPreset: null },
    });
  });

  test('błąd sieci → wszystko unknown', async () => {
    const fakeFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const data = (await createShowersSpecial(TOKEN, fakeFetch).fetchData()) as ShowersData;
    expect(data.qwwwetek.light).toBe('unknown');
  });
});
