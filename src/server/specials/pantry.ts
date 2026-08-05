import type { PantryData, PantryItemState, PantryStatus } from '../../shared/types';
import type { SpecialMode } from './index';

const SOURCES = {
  ser: 'http://czyjestser.www22.duck.edu.pl/ser.txt',
  mleko: 'http://czyjestmleko.www22.duck.edu.pl/mleko.txt',
  chleb: 'http://czyjestchlebtostowy.www22.duck.edu.pl/chleb.txt',
} as const;

const FETCH_TIMEOUT_MS = 3000;

export function parseStatus(text: string): PantryStatus {
  const t = text.trim();
  if (t.startsWith('Otóż TAK')) return 'ok';
  if (t.startsWith('Już prawie')) return 'low';
  return 'out';
}

async function fetchOne(url: string, fetchFn: typeof fetch): Promise<PantryItemState> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    return { status: parseStatus(text), text };
  } catch {
    return { status: 'unknown', text: '???' };
  }
}

export function createPantrySpecial(fetchFn: typeof fetch = fetch): SpecialMode {
  return {
    id: 'pantry',
    duration: 15_000,
    async fetchData(): Promise<PantryData> {
      const [ser, mleko, chleb] = await Promise.all([
        fetchOne(SOURCES.ser, fetchFn),
        fetchOne(SOURCES.mleko, fetchFn),
        fetchOne(SOURCES.chleb, fetchFn),
      ]);
      return { ser, mleko, chleb };
    },
  };
}
