import type { HistoryEntry, ItemKind, StateMessage } from '../../shared/types';
import { connect } from '../lib/connection';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel)!;
const nowContent = $('#now-content');
const historyList = $<HTMLUListElement>('#history');
const playAdBtn = $<HTMLButtonElement>('#play-ad');
const stopAdBtn = $<HTMLButtonElement>('#stop-ad');
const limitInput = $<HTMLInputElement>('#limit');

const KIND_LABEL: Record<ItemKind, string> = {
  image: 'mem', video: 'wideo', ad: 'reklama', special: 'tryb specjalny', idle: 'bezczynność',
};
const KIND_ICON: Record<ItemKind, string> = {
  image: '🖼', video: '▶', ad: '📢', special: '✨', idle: '💤',
};

let state: StateMessage | null = null;
let history: HistoryEntry[] = [];

limitInput.value = localStorage.getItem('memiarka-limit') ?? '20';
limitInput.addEventListener('change', () => {
  localStorage.setItem('memiarka-limit', limitInput.value);
  renderHistory();
});

const conn = connect((msg) => {
  if (msg.type === 'state') {
    state = msg;
    renderNow();
  } else if (msg.type === 'history') {
    history = msg.entries;
    renderHistory();
  }
});

playAdBtn.addEventListener('click', () => conn.send({ type: 'playAd' }));
stopAdBtn.addEventListener('click', () => conn.send({ type: 'stopAd' }));

function thumb(kind: ItemKind, url?: string): HTMLElement {
  if (kind === 'image' && url) {
    const el = document.createElement('img');
    el.src = url;
    return el;
  }
  const el = document.createElement('span');
  el.className = 'thumb-icon';
  el.textContent = KIND_ICON[kind];
  return el;
}

function renderNow(): void {
  if (!state) return;
  nowContent.replaceChildren();
  const { item } = state;
  if (item.kind === 'idle') {
    nowContent.textContent = 'nic nie gra — wrzuć pliki do ./media';
  } else {
    nowContent.append(thumb(item.kind, item.url));
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name ?? '?';
    const kind = document.createElement('span');
    kind.className = 'kind';
    kind.textContent = KIND_LABEL[item.kind];
    meta.append(name, kind);
    if (state.newMem) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'NOWY MEM!';
      meta.append(badge);
    }
    nowContent.append(meta);
  }
  playAdBtn.disabled = !state.adsAvailable;
  stopAdBtn.disabled = state.item.kind !== 'ad';
}

function renderHistory(): void {
  const limit = Math.max(1, Number(limitInput.value) || 20);
  historyList.replaceChildren(
    ...history.slice(0, limit).map((e) => {
      const li = document.createElement('li');
      li.append(thumb(e.kind, e.url));
      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = e.name;
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = KIND_LABEL[e.kind];
      meta.append(name, kind);
      if (e.newMem) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'NOWY MEM!';
        meta.append(badge);
      }
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = new Date(e.playedAt).toLocaleTimeString('pl-PL');
      li.append(meta, time);
      return li;
    }),
  );
}
