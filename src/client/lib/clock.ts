const MAX_SAMPLES = 7;

export function computeOffset(t0: number, serverTime: number, t1: number): number {
  return serverTime - (t0 + t1) / 2;
}

export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error('median: pusta tablica');
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class SyncedClock {
  private samples: number[] = [];

  addSample(t0: number, serverTime: number, t1: number): void {
    this.samples.push(computeOffset(t0, serverTime, t1));
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  get offset(): number {
    return this.samples.length === 0 ? 0 : median(this.samples);
  }

  now(): number {
    return Date.now() + this.offset;
  }
}
