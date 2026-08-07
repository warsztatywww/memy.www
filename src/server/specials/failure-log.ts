const MAX_CAUSE_DEPTH = 4;

function one(err: Error): string {
  const code = (err as NodeJS.ErrnoException).code;
  return code && !err.message.includes(code) ? `${err.message} (${code})` : err.message;
}

/**
 * Płaski opis błędu razem z przyczynami. `fetch` z undici rzuca gołe „fetch failed",
 * a konkret (EAI_AGAIN, ECONNREFUSED, ETIMEDOUT) siedzi dopiero w `cause` — bez
 * rozwinięcia łańcucha log nie mówi nic.
 */
export function describeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && cur instanceof Error; depth++) {
    parts.push(one(cur));
    if (cur instanceof AggregateError && cur.errors.length > 0) {
      parts.push(cur.errors.map((e) => (e instanceof Error ? one(e) : String(e))).join(', '));
      break;
    }
    cur = cur.cause;
  }
  return parts.length > 0 ? parts.join(' ← ') : String(err);
}

/**
 * Logowanie awarii źródeł danych. Poller odpytuje co kilka sekund, więc gadanie
 * przy każdym błędzie zalałoby logi — meldujemy raz na serię: pierwszy błąd danej
 * treści i powrót do zdrowia.
 */
export function createFailureLog(
  prefix: string,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): (source: string, err: unknown | null) => void {
  const failing = new Map<string, string>();
  return (source, err) => {
    if (err === null) {
      if (failing.delete(source)) warn(`[${prefix}] ${source} znów odpowiada`);
      return;
    }
    const msg = describeError(err);
    if (failing.get(source) === msg) return;
    failing.set(source, msg);
    warn(`[${prefix}] ${source} nie odpowiada: ${msg}`);
  };
}
