import { createPantrySpecial } from './pantry';
import { createShowersSpecial } from './showers';

export interface SpecialMode {
  id: string;
  duration: number; // ms
  fetchData(): Promise<unknown>;
}

// Nowy tryb = nowy plik w tym katalogu + wpis tutaj
// (+ odpowiednik kliencki w src/client/specials/).
export function createSpecials(haToken: string): SpecialMode[] {
  return [createPantrySpecial(), createShowersSpecial(haToken)];
}
