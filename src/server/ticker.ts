import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { TickerItem } from '../shared/types';

const MAX_TEXT_LENGTH = 500;

export class TickerStore extends EventEmitter {
  private items: TickerItem[] = [];

  constructor(private filePath: string) {
    super();
    try {
      const raw: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
      if (Array.isArray(raw)) {
        this.items = raw.filter(
          (i): i is TickerItem => typeof i?.id === 'string' && typeof i?.text === 'string',
        );
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[ticker] nie udało się wczytać ${filePath}:`, err);
      }
    }
  }

  messages(): TickerItem[] {
    return [...this.items];
  }

  add(text: string): void {
    const trimmed = text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!trimmed) return;
    this.items.push({ id: randomUUID(), text: trimmed });
    this.persist();
    this.emit('update');
  }

  remove(id: string): void {
    const next = this.items.filter((i) => i.id !== id);
    if (next.length === this.items.length) return;
    this.items = next;
    this.persist();
    this.emit('update');
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.items, null, 2));
    } catch (err) {
      console.warn(`[ticker] nie udało się zapisać ${this.filePath}:`, err);
    }
  }
}
