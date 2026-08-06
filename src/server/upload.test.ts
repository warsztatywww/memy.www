import { describe, expect, test } from 'vitest';
import { validateUploadName } from './upload';

describe('validateUploadName', () => {
  test('akceptuje poprawne nazwy obrazów i wideo', () => {
    expect(validateUploadName('kot.jpg')).toBeNull();
    expect(validateUploadName('KOT.JPG')).toBeNull();
    expect(validateUploadName('śmieszny mem (2).webm')).toBeNull();
  });

  test('odrzuca path traversal i separatory ścieżek', () => {
    expect(validateUploadName('../evil.jpg')).not.toBeNull();
    expect(validateUploadName('a/b.jpg')).not.toBeNull();
    expect(validateUploadName('a\\b.jpg')).not.toBeNull();
    expect(validateUploadName('a\0.jpg')).not.toBeNull();
  });

  test('odrzuca nazwy zaczynające się od kropki', () => {
    expect(validateUploadName('.ukryty.jpg')).not.toBeNull();
  });

  test('odrzuca złe rozszerzenia i brak nazwy', () => {
    expect(validateUploadName('wirus.exe')).not.toBeNull();
    expect(validateUploadName('kot.jpg.tmp')).not.toBeNull();
    expect(validateUploadName('bez-rozszerzenia')).not.toBeNull();
    expect(validateUploadName('')).not.toBeNull();
  });
});
