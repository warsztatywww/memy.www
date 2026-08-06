import { EventEmitter } from 'node:events';
import type { SpecialMode } from './specials/index';

export class StatusPoller extends EventEmitter {
  private data = new Map<string, unknown>();
  private lastSerialized = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(
    private specials: SpecialMode[],
    private intervalMs: number,
  ) {
    super();
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  getData(id: string): unknown {
    return this.data.get(id) ?? null;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return; // poprzedni tick jeszcze trwa
    this.ticking = true;
    await Promise.all(
      this.specials.map(async (s) => {
        try {
          this.data.set(s.id, await s.fetchData());
        } catch {
          // snapshot bez zmian — fetchData specials i tak łyka błędy sieci
        }
      }),
    );
    this.ticking = false;
    const serialized = JSON.stringify([...this.data.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    if (serialized !== this.lastSerialized) {
      this.lastSerialized = serialized;
      this.emit('update');
    }
  }
}
