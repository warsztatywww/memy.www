import type { PantryData, PantryItemState, PantryStatus } from '../../shared/types';
import { createFailureLog } from './failure-log';
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

type NoteFailure = (source: string, err: unknown | null) => void;

async function fetchOne(
  name: string,
  url: string,
  fetchFn: typeof fetch,
  note: NoteFailure,
): Promise<PantryItemState> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    note(name, null);
    return { status: parseStatus(text), text };
  } catch (err) {
    note(name, err);
    return { status: 'unknown', text: '???' };
  }
}

export function createPantrySpecial(fetchFn: typeof fetch = fetch): SpecialMode {
  const note = createFailureLog('pantry');
  return {
    id: 'pantry',
    duration: 15_000,
    async fetchData(): Promise<PantryData> {
      const [ser, mleko, chleb] = await Promise.all([
        fetchOne('ser', SOURCES.ser, fetchFn, note),
        fetchOne('mleko', SOURCES.mleko, fetchFn, note),
        fetchOne('chleb', SOURCES.chleb, fetchFn, note),
      ]);
      return { ser, mleko, chleb };
    },
  };
}
