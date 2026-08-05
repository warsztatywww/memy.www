import { EventEmitter } from 'node:events';
import type { HistoryEntry, StateItem, StateMessage } from '../shared/types';
import type { MediaItem, MediaSource } from './library';
import { ShuffleBag } from './shuffle-bag';
import type { SpecialMode } from './specials/index';

export interface RadioConfig {
  imageDurationMs: number;
  adInterval: number;
  specialIntervalMs: number;
  historySize: number;
}

interface RadioDeps {
  memes: MediaSource;
  ads: MediaSource;
  specials: SpecialMode[];
  config: RadioConfig;
  rng?: () => number;
}

interface CurrentState {
  item: StateItem;
  startedAt: number;
  duration: number;
  newMem: boolean;
}

export class Radio extends EventEmitter {
  private memes: MediaSource;
  private ads: MediaSource;
  private specials: SpecialMode[];
  private config: RadioConfig;
  private rng: () => number;

  private memeBag: ShuffleBag<string>;
  private adBag: ShuffleBag<string>;
  private current: CurrentState = { item: { kind: 'idle' }, startedAt: 0, duration: 0, newMem: false };
  private historyBuf: HistoryEntry[] = [];
  private memesSinceAd = 0;
  private newMemQueue: MediaItem[] = [];
  private pendingSpecial: { mode: SpecialMode; data: unknown } | null = null;
  private fetchingSpecial = false;
  private specialIndex = 0;
  private endTimer: ReturnType<typeof setTimeout> | undefined;
  private specialTimer: ReturnType<typeof setInterval> | undefined;

  constructor(deps: RadioDeps) {
    super();
    this.memes = deps.memes;
    this.ads = deps.ads;
    this.specials = deps.specials;
    this.config = deps.config;
    this.rng = deps.rng ?? Math.random;
    this.memeBag = new ShuffleBag<string>(this.rng);
    this.adBag = new ShuffleBag<string>(this.rng);
  }

  start(): void {
    this.syncBags();
    this.memes.on('added', (item: MediaItem) => this.onNewMeme(item));
    this.memes.on('removed', () => this.syncBags());
    this.ads.on('added', () => { this.syncBags(); this.emit('update'); });
    this.ads.on('removed', () => { this.syncBags(); this.emit('update'); });
    if (this.specials.length > 0) {
      this.specialTimer = setInterval(() => this.prefetchSpecial(), this.config.specialIntervalMs);
    }
    this.advance();
  }

  stop(): void {
    clearTimeout(this.endTimer);
    clearInterval(this.specialTimer);
  }

  stateMessage(): StateMessage {
    return {
      type: 'state',
      ...this.current,
      serverNow: Date.now(),
      adsAvailable: this.adBag.size > 0,
    };
  }

  history(): HistoryEntry[] {
    return [...this.historyBuf];
  }

  playAdNow(): void {
    const item = this.nextAd();
    if (item) this.playMedia(item, { ad: true });
  }

  stopAd(): void {
    if (this.current.item.kind !== 'ad') return;
    this.advance();
  }

  private syncBags(): void {
    this.memeBag.setItems(this.memes.items().map((i) => i.file));
    this.adBag.setItems(this.ads.items().map((i) => i.file));
  }

  private onNewMeme(item: MediaItem): void {
    this.syncBags();
    if (this.current.item.kind === 'ad') {
      this.newMemQueue.push(item);
      return;
    }
    this.memeBag.consume(item.file);
    this.playMedia(item, { newMem: true });
  }

  private prefetchSpecial(): void {
    if (this.specials.length === 0 || this.pendingSpecial || this.fetchingSpecial) return;
    const mode = this.specials[this.specialIndex % this.specials.length];
    this.specialIndex++;
    this.fetchingSpecial = true;
    void mode
      .fetchData()
      .catch(() => null)
      .then((data) => {
        this.fetchingSpecial = false;
        this.pendingSpecial = { mode, data };
      });
  }

  private advance(): void {
    const queued = this.newMemQueue.shift();
    if (queued) {
      this.memeBag.consume(queued.file);
      return this.playMedia(queued, { newMem: true });
    }

    if (this.pendingSpecial) {
      const { mode, data } = this.pendingSpecial;
      this.pendingSpecial = null;
      return this.playSpecial(mode, data);
    }

    if (this.memesSinceAd >= this.config.adInterval) {
      const ad = this.nextAd();
      if (ad) return this.playMedia(ad, { ad: true });
    }

    const file = this.memeBag.next();
    const item = file ? this.memes.get(file) : undefined;
    if (!item) return this.playIdle();
    this.memesSinceAd++;
    this.playMedia(item, {});
  }

  private nextAd(): MediaItem | undefined {
    const file = this.adBag.next();
    const item = file ? this.ads.get(file) : undefined;
    if (item) this.memesSinceAd = 0;
    return item;
  }

  private playMedia(item: MediaItem, opts: { newMem?: boolean; ad?: boolean }): void {
    const kind = opts.ad ? 'ad' : item.type;
    const duration = item.type === 'image' ? this.config.imageDurationMs : (item.duration ?? this.config.imageDurationMs);
    const url = `${opts.ad ? '/ads' : '/media'}/${encodeURIComponent(item.file)}`;
    this.setState({ kind, url, name: item.file }, duration, opts.newMem ?? false);
  }

  private playSpecial(mode: SpecialMode, data: unknown): void {
    this.setState(
      { kind: 'special', specialId: mode.id, name: mode.id, data, seed: Math.floor(this.rng() * 2 ** 31) },
      mode.duration,
      false,
    );
  }

  private playIdle(): void {
    clearTimeout(this.endTimer);
    this.current = { item: { kind: 'idle' }, startedAt: Date.now(), duration: 0, newMem: false };
    this.emit('update');
  }

  private setState(item: StateItem, duration: number, newMem: boolean): void {
    clearTimeout(this.endTimer);
    this.current = { item, startedAt: Date.now(), duration, newMem };
    this.historyBuf.unshift({
      kind: item.kind,
      name: item.name ?? item.specialId ?? '?',
      url: item.url,
      playedAt: Date.now(),
      newMem,
    });
    if (this.historyBuf.length > this.config.historySize) this.historyBuf.pop();
    this.endTimer = setTimeout(() => this.advance(), duration);
    this.emit('update');
  }
}
