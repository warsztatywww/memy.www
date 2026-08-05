import { createPantrySpecial } from './pantry';

export interface SpecialMode {
  id: string;
  duration: number; // ms
  fetchData(): Promise<unknown>;
}

// Nowy tryb = nowy plik w tym katalogu + wpis tutaj
// (+ odpowiednik kliencki w src/client/specials/).
export const specials: SpecialMode[] = [createPantrySpecial()];
