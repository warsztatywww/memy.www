import { execFile } from 'node:child_process';

export function parseDuration(output: string): number {
  const seconds = Number.parseFloat(output.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe: nieprawidłowa długość: ${JSON.stringify(output)}`);
  }
  return Math.round(seconds * 1000);
}

export function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(parseDuration(stdout));
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}
