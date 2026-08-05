export class ShuffleBag<T> {
  private pool: T[] = [];
  private bag: T[] = [];
  private last: T | undefined;

  constructor(private rng: () => number = Math.random) {}

  get size(): number {
    return this.pool.length;
  }

  setItems(items: T[]): void {
    const next = new Set(items);
    const old = new Set(this.pool);
    this.bag = this.bag.filter((x) => next.has(x));
    for (const item of items) {
      if (!old.has(item)) {
        const i = Math.floor(this.rng() * (this.bag.length + 1));
        this.bag.splice(i, 0, item);
      }
    }
    this.pool = [...items];
  }

  next(): T | undefined {
    if (this.pool.length === 0) return undefined;
    if (this.bag.length === 0) {
      this.bag = [...this.pool];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      // next() zdejmuje z końca — nie powtarzaj ostatnio zagranego na styku cykli
      if (this.pool.length > 1 && this.bag[this.bag.length - 1] === this.last) {
        [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
      }
    }
    this.last = this.bag.pop();
    return this.last;
  }

  consume(item: T): void {
    const i = this.bag.indexOf(item);
    if (i !== -1) this.bag.splice(i, 1);
    this.last = item;
  }
}
