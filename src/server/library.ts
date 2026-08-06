import { EventEmitter } from 'node:events';
import { readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { probeDuration } from './ffprobe';
import { IMAGE_EXT, VIDEO_EXT } from '../shared/media-ext';

export interface MediaItem {
  file: string;
  path: string;
  type: 'image' | 'video';
  duration?: number;
}

export interface MediaSource extends EventEmitter {
  items(): MediaItem[];
  get(file: string): MediaItem | undefined;
}

export interface MediaLibraryOptions {
  videosOnly?: boolean;
  probe?: (path: string) => Promise<number>;
  stabilityThreshold?: number;
}

export class MediaLibrary extends EventEmitter implements MediaSource {
  private byFile = new Map<string, MediaItem>();
  private watcher: FSWatcher | undefined;
  private probe: (path: string) => Promise<number>;

  constructor(
    private dir: string,
    private opts: MediaLibraryOptions = {},
  ) {
    super();
    this.probe = opts.probe ?? probeDuration;
  }

  items(): MediaItem[] {
    return [...this.byFile.values()];
  }

  get(file: string): MediaItem | undefined {
    return this.byFile.get(file);
  }

  remove(file: string): void {
    if (this.byFile.delete(file)) this.emit('removed', file);
  }

  async start(): Promise<void> {
    // Skan początkowy własnymi siłami — chokidarowe eventy `add` z awaitWriteFinish
    // potrafią przyjść po `ready` i skan byłby niedeterministyczny.
    const entries = await readdir(this.dir, { withFileTypes: true });
    await Promise.all(
      entries.filter((e) => e.isFile()).map((e) => this.tryAdd(join(this.dir, e.name), false)),
    );
    this.watcher = chokidar.watch(this.dir, {
      depth: 0,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: this.opts.stabilityThreshold ?? 2000,
        pollInterval: 100,
      },
    });
    this.watcher.on('add', (p) => {
      if (!this.byFile.has(basename(p))) void this.tryAdd(p, true);
    });
    this.watcher.on('unlink', (p) => this.remove(basename(p)));
    this.watcher.on('error', (err) => console.warn('[library] watcher error:', err));
    await new Promise<void>((res) => this.watcher!.once('ready', res));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
  }

  private async tryAdd(p: string, emit: boolean): Promise<void> {
    const ext = extname(p).toLowerCase();
    let type: 'image' | 'video';
    if (VIDEO_EXT.has(ext)) type = 'video';
    else if (IMAGE_EXT.has(ext) && !this.opts.videosOnly) type = 'image';
    else return;
    try {
      const duration = type === 'video' ? await this.probe(p) : undefined;
      const item: MediaItem = { file: basename(p), path: p, type, duration };
      this.byFile.set(item.file, item);
      if (emit) this.emit('added', item);
    } catch (err) {
      console.warn(`[library] pomijam ${p}:`, err instanceof Error ? err.message : err);
    }
  }
}
