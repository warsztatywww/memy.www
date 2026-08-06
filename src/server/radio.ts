import { EventEmitter } from 'node:events';
import type { HistoryEntry, StateItem, StateMessage } from '../shared/types';
import type { MediaItem, MediaSource } from './library';
import { ShuffleBag } from './shuffle-bag';

export interface SpecialSlot {
  id: string;
  duration: number; // ms
}

export interface RadioConfig {
  imageDurationMs: number;
  adInterval: number;
  specialIntervalMs: number;
  historySize: number;
}

interface RadioDeps {
  memes: MediaSource;
  ads: MediaSource;
  specials: SpecialSlot[];
  getSpecialData: (id: string) => unknown;
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
  private specials: SpecialSlot[];
  private getSpecialData: (id: string) => unknown;
  private config: RadioConfig;
  private rng: () => number;

  private memeBag: ShuffleBag<string>;
  private adBag: ShuffleBag<string>;
  private current: CurrentState = { item: { kind: 'idle' }, startedAt: 0, duration: 0, newMem: false };
  private historyBuf: HistoryEntry[] = [];
  private memesSinceAd = 0;
  private newMemQueue: MediaItem[] = [];
  private pendingSpecial: SpecialSlot | null = null;
  private specialIndex = 0;
  private endTimer: ReturnType<typeof setTimeout> | undefined;
  private specialTimer: ReturnType<typeof setInterval> | undefined;
  private onMemeAdded?: (item: MediaItem) => void;
  private onMemeRemoved?: () => void;
  private onAdAdded?: () => void;
  private onAdRemoved?: () => void;

  constructor(deps: RadioDeps) {
    super();
    this.memes = deps.memes;
    this.ads = deps.ads;
    this.specials = deps.specials;
    this.getSpecialData = deps.getSpecialData;
    this.config = deps.config;
    this.rng = deps.rng ?? Math.random;
    this.memeBag = new ShuffleBag<string>(this.rng);
    this.adBag = new ShuffleBag<string>(this.rng);
  }

  start(): void {
    this.syncBags();
    this.onMemeAdded = (item: MediaItem) => this.onNewMeme(item);
    this.onMemeRemoved = () => this.syncBags();
    this.onAdAdded = () => { this.syncBags(); this.emit('update'); };
    this.onAdRemoved = () => { this.syncBags(); this.emit('update'); };
    this.memes.on('added', this.onMemeAdded);
    this.memes.on('removed', this.onMemeRemoved);
    this.ads.on('added', this.onAdAdded);
    this.ads.on('removed', this.onAdRemoved);
    if (this.specials.length > 0) {
      this.specialTimer = setInterval(() => this.queueSpecial(), this.config.specialIntervalMs);
    }
    this.advance();
  }

  stop(): void {
    clearTimeout(this.endTimer);
    clearInterval(this.specialTimer);
    if (this.onMemeAdded) this.memes.off('added', this.onMemeAdded);
    if (this.onMemeRemoved) this.memes.off('removed', this.onMemeRemoved);
    if (this.onAdAdded) this.ads.off('added', this.onAdAdded);
    if (this.onAdRemoved) this.ads.off('removed', this.onAdRemoved);
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

  skip(): void {
    if (this.current.item.kind === 'idle') return;
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

  private queueSpecial(): void {
    if (this.specials.length === 0 || this.pendingSpecial) return;
    this.pendingSpecial = this.specials[this.specialIndex % this.specials.length];
    this.specialIndex++;
  }

  private advance(): void {
    const queued = this.newMemQueue.shift();
    if (queued) {
      this.memeBag.consume(queued.file);
      return this.playMedia(queued, { newMem: true });
    }

    if (this.pendingSpecial) {
      const slot = this.pendingSpecial;
      this.pendingSpecial = null;
      const data = this.getSpecialData(slot.id);
      if (data != null) return this.playSpecial(slot, data);
      // brak snapshotu — slajd pominięty w tej rundzie, interwał zakolejkuje następny
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

  private playSpecial(slot: SpecialSlot, data: unknown): void {
    this.setState(
      { kind: 'special', specialId: slot.id, name: slot.id, data, seed: Math.floor(this.rng() * 2 ** 31) },
      slot.duration,
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
