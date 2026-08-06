import { basename, extname } from 'node:path';
import { IMAGE_EXT, VIDEO_EXT } from '../shared/media-ext';

/** Zwraca komunikat błędu albo null, gdy nazwa jest bezpieczna i obsługiwana. */
export function validateUploadName(name: string): string | null {
  if (!name) return 'brak nazwy pliku';
  if (name !== basename(name) || name.includes('\\') || name.includes('\0')) {
    return 'niedozwolona nazwa pliku';
  }
  if (name.startsWith('.')) return 'niedozwolona nazwa pliku';
  const ext = extname(name).toLowerCase();
  if (!IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext)) return 'nieobsługiwany typ pliku';
  return null;
}
