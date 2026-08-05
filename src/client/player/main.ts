import { mulberry32 } from '../../shared/prng';
import type { StateMessage } from '../../shared/types';
import { connect } from '../lib/connection';
import { clientSpecials } from '../specials/index';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel)!;
const img = $<HTMLImageElement>('#layer-img');
const video = $<HTMLVideoElement>('#layer-video');
const canvas = $<HTMLCanvasElement>('#layer-canvas');
const idleEl = $('#idle');
const banner = $('#banner');
const videoError = $('#video-error');
const startOverlay = $('#start-overlay');

const BANNER_MS = 4000;
let started = false;
let lastState: StateMessage | null = null;
let rafId = 0;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;

const conn = connect((msg) => {
  if (msg.type === 'state') {
    lastState = msg;
    if (started) apply(msg);
  }
});

$('#start').addEventListener('click', () => {
  started = true;
  startOverlay.classList.add('hidden');
  if (lastState) apply(lastState);
});
$('#fullscreen').addEventListener('click', () => {
  void document.documentElement.requestFullscreen().catch(() => {});
});

function elapsed(state: StateMessage): number {
  return conn.clock.now() - state.startedAt;
}

function hideAll(): void {
  cancelAnimationFrame(rafId);
  for (const el of [img, video, canvas]) el.classList.remove('visible');
  idleEl.classList.add('hidden');
  videoError.classList.add('hidden');
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function apply(state: StateMessage): void {
  hideAll();
  switch (state.item.kind) {
    case 'idle':
      idleEl.classList.remove('hidden');
      break;
    case 'image':
      img.src = state.item.url!;
      img.classList.add('visible');
      break;
    case 'video':
    case 'ad':
      showVideo(state);
      break;
    case 'special':
      showSpecial(state);
      break;
  }
  clearTimeout(bannerTimer);
  if (state.newMem && elapsed(state) < BANNER_MS) {
    banner.classList.remove('hidden');
    bannerTimer = setTimeout(() => banner.classList.add('hidden'), BANNER_MS - elapsed(state));
  } else {
    banner.classList.add('hidden');
  }
}

function showVideo(state: StateMessage): void {
  const fail = (): void => {
    hideAll();
    videoError.textContent = state.item.name ?? '';
    videoError.classList.remove('hidden');
  };
  video.src = state.item.url!;
  video.addEventListener(
    'loadedmetadata',
    () => {
      video.currentTime = Math.max(0, elapsed(state) / 1000);
      video.play().catch(fail);
    },
    { once: true },
  );
  video.addEventListener('error', fail, { once: true });
  video.classList.add('visible');
}

function showSpecial(state: StateMessage): void {
  const special = clientSpecials.find((s) => s.id === state.item.specialId);
  if (!special) return; // nieznany tryb — czarny ekran do końca slotu
  canvas.classList.add('visible');
  const ctx = canvas.getContext('2d')!;
  const seed = state.item.seed ?? 0;
  const frame = (): void => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    special.render(ctx, elapsed(state), canvas.width, canvas.height, state.item.data, mulberry32(seed));
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

// Tryb podglądu trybów specjalnych: /player?preview=pantry (bez WS, dane z previewData)
const preview = new URLSearchParams(location.search).get('preview');
if (preview) {
  const special = clientSpecials.find((s) => s.id === preview);
  startOverlay.classList.add('hidden');
  started = true;
  if (special) {
    const fakeState: StateMessage = {
      type: 'state',
      item: { kind: 'special', specialId: special.id, name: special.id, data: special.previewData, seed: 42 },
      startedAt: Date.now(),
      duration: 999_999,
      newMem: false,
      serverNow: Date.now(),
      adsAvailable: false,
    };
    apply(fakeState);
  }
}
