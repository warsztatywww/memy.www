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
    const msg = err instanceof Error ? err.message : String(err);
    if (failing.get(source) === msg) return;
    failing.set(source, msg);
    warn(`[${prefix}] ${source} nie odpowiada: ${msg}`);
  };
}
