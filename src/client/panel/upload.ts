import { IMAGE_EXT, VIDEO_EXT } from '../../shared/media-ext';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel)!;
const pickBtn = $<HTMLButtonElement>('#upload-pick');
const fileInput = $<HTMLInputElement>('#upload-input');
const resultList = $<HTMLUListElement>('#upload-results');
const overlay = $('#drop-overlay');

const SUCCESS_HIDE_MS = 5000;

interface Entry {
  file: File;
  li: HTMLLIElement;
  status: HTMLSpanElement;
}

const queue: Entry[] = [];
let uploading = false;

function hasSupportedExt(name: string): boolean {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  return IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext);
}

function addResult(name: string): { li: HTMLLIElement; status: HTMLSpanElement } {
  const li = document.createElement('li');
  const nameEl = document.createElement('span');
  nameEl.className = 'name';
  nameEl.textContent = name;
  const status = document.createElement('span');
  status.className = 'upload-status';
  li.append(nameEl, status);
  resultList.append(li);
  return { li, status };
}

function fail(entry: Entry, msg: string): void {
  entry.status.textContent = `✗ ${msg}`;
  entry.li.classList.add('upload-error');
  const close = document.createElement('button');
  close.className = 'upload-remove';
  close.textContent = '✕';
  close.title = 'Zamknij';
  close.addEventListener('click', () => entry.li.remove());
  entry.li.append(close);
}

function enqueueFiles(files: Iterable<File>): void {
  for (const file of files) {
    const entry: Entry = { file, ...addResult(file.name) };
    if (!hasSupportedExt(file.name)) {
      fail(entry, 'nieobsługiwany typ pliku');
      continue;
    }
    entry.status.textContent = 'w kolejce';
    queue.push(entry);
  }
  void processQueue();
}

async function processQueue(): Promise<void> {
  if (uploading) return;
  uploading = true;
  let entry: Entry | undefined;
  while ((entry = queue.shift())) await uploadOne(entry);
  uploading = false;
}

function uploadOne(entry: Entry): Promise<void> {
  // XHR zamiast fetch — fetch nie raportuje progresu wysyłania.
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?name=${encodeURIComponent(entry.file.name)}`);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        entry.status.textContent = `wysyłanie… ${Math.round((e.loaded / e.total) * 100)}%`;
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        entry.status.textContent = '✓ wrzucony';
        entry.li.classList.add('upload-ok');
        setTimeout(() => entry.li.remove(), SUCCESS_HIDE_MS);
      } else {
        let msg = 'błąd wysyłania';
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
        } catch { /* zostaje domyślny komunikat */ }
        fail(entry, msg);
      }
      resolve();
    });
    xhr.addEventListener('error', () => {
      fail(entry, 'błąd wysyłania');
      resolve();
    });
    entry.status.textContent = 'wysyłanie… 0%';
    xhr.send(entry.file);
  });
}

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files?.length) enqueueFiles(fileInput.files);
  fileInput.value = '';
});

// Drag&drop na całym oknie: licznik zagłębienia, bo dragenter/dragleave
// odpalają się na każdym elemencie po drodze.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    overlay.hidden = true;
  }
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  if (e.dataTransfer?.files.length) enqueueFiles(e.dataTransfer.files);
});
