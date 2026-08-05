import { describe, expect, test } from 'vitest';
import { mulberry32 } from '../shared/prng';
import { ShuffleBag } from './shuffle-bag';

describe('ShuffleBag', () => {
  test('pusta pula zwraca undefined', () => {
    const bag = new ShuffleBag<string>(mulberry32(1));
    expect(bag.next()).toBeUndefined();
    expect(bag.size).toBe(0);
  });

  test('jeden cykl = każdy element dokładnie raz', () => {
    const bag = new ShuffleBag<string>(mulberry32(1));
    bag.setItems(['a', 'b', 'c', 'd']);
    const cycle = [bag.next(), bag.next(), bag.next(), bag.next()];
    expect([...cycle].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  test('brak powtórki na styku cykli', () => {
    const bag = new ShuffleBag<string>(mulberry32(3));
    bag.setItems(['a', 'b', 'c']);
    let prev: string | undefined;
    for (let i = 0; i < 300; i++) {
      const cur = bag.next();
      expect(cur).not.toBe(prev);
      prev = cur;
    }
  });

  test('setItems usuwa element także z bieżącego worka', () => {
    const bag = new ShuffleBag<string>(mulberry32(1));
    bag.setItems(['a', 'b', 'c']);
    bag.next();
    bag.setItems(['a']); // usunięto b i c
    for (let i = 0; i < 10; i++) expect(bag.next()).toBe('a');
  });

  test('setItems dodaje nowy element do bieżącego cyklu', () => {
    const bag = new ShuffleBag<string>(mulberry32(1));
    bag.setItems(['a', 'b']);
    const first = bag.next()!;
    bag.setItems(['a', 'b', 'c']);
    const rest = [bag.next(), bag.next()];
    expect([first, ...rest].sort()).toEqual(['a', 'b', 'c']);
  });

  test('consume usuwa element z bieżącego worka — nie zostanie wylosowany w tym cyklu', () => {
    const bag = new ShuffleBag<string>(mulberry32(1));
    bag.setItems(['a', 'b', 'c']);
    bag.consume('c');
    const rest = [bag.next(), bag.next()];
    expect(rest.sort()).toEqual(['a', 'b']);
  });

  test('consume ustawia last — kolejny cykl nie zaczyna się od tego elementu', () => {
    const bag = new ShuffleBag<string>(mulberry32(1));
    bag.setItems(['a', 'b']);
    const first = bag.next()!;
    const remaining = first === 'a' ? 'b' : 'a';
    bag.consume(remaining); // opróżnia worek, last = remaining
    expect(bag.next()).not.toBe(remaining);
  });
});
