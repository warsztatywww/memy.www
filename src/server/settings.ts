import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Settings {
  autoAds: boolean;
}

const DEFAULTS: Settings = { autoAds: true };

export class SettingsStore {
  private settings: Settings = { ...DEFAULTS };

  constructor(private filePath: string) {
    try {
      const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<Settings> | null;
      if (typeof raw?.autoAds === 'boolean') this.settings.autoAds = raw.autoAds;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn(`[settings] nie udało się wczytać ${filePath}:`, err);
      }
    }
  }

  get autoAds(): boolean {
    return this.settings.autoAds;
  }

  setAutoAds(enabled: boolean): void {
    if (this.settings.autoAds === enabled) return;
    this.settings.autoAds = enabled;
    this.persist();
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2));
    } catch (err) {
      console.warn(`[settings] nie udało się zapisać ${this.filePath}:`, err);
    }
  }
}
