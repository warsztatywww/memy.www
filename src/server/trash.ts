import { mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Przenosi zgłoszonego mema do kosza; kolizja nazwy dostaje prefiks z timestampem,
// żeby niczego nie nadpisać.
export async function moveToTrash(mediaDir: string, file: string): Promise<string> {
  const trashDir = join(mediaDir, 'trash');
  await mkdir(trashDir, { recursive: true });
  let dest = join(trashDir, file);
  if (await exists(dest)) dest = join(trashDir, `${Date.now()}-${file}`);
  await rename(join(mediaDir, file), dest);
  return dest;
}
