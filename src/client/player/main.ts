import { mulberry32 } from '../../shared/prng';
import type { PantryItemState, ShowerState, StateMessage, StatusMessage, TickerItem } from '../../shared/types';
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
const tickerBar = $('#ticker-bar');
const tickerTrack = $('#ticker-track');
const tickerA = $('#ticker-a');
const tickerB = $('#ticker-b');
const statusPantry = $('#status-pantry');
const statusShowers = $('#status-showers');

const BANNER_MS = 4000;
let started = false;
let lastState: StateMessage | null = null;
let appliedKey: string | null = null;
let rafId = 0;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;

// Tryb podglądu trybów specjalnych: /player?preview=pantry (bez WS, dane z previewData)
const preview = new URLSearchParams(location.search).get('preview');

// Zegar: w trybie normalnym synchronizowany z serwerem, w trybie podglądu — lokalny (brak WS).
let nowFn: () => number = Date.now;

if (!preview) {
  const conn = connect((msg) => {
    if (msg.type === 'state') {
      lastState = msg;
      if (started && stateKey(msg) !== appliedKey) apply(msg);
    } else if (msg.type === 'ticker') {
      renderTicker(msg.messages);
    } else if (msg.type === 'status') {
      renderStatus(msg);
    }
  });
  nowFn = () => conn.clock.now();
}

$('#start').addEventListener('click', () => {
  started = true;
  startOverlay.classList.add('hidden');
  if (lastState) apply(lastState);
});
$('#fullscreen').addEventListener('click', () => {
  void document.documentElement.requestFullscreen().catch(() => {});
});

function stateKey(state: StateMessage): string {
  return `${state.startedAt}:${state.item.url ?? state.item.specialId ?? state.item.kind}`;
}

function elapsed(state: StateMessage): number {
  return nowFn() - state.startedAt;
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
  appliedKey = stateKey(state);
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

const TICKER_SPEED_PX_S = 120; // stała prędkość — dłuższa treść przewija się dłużej
const TICKER_SEP = '  •  '; // spacje nierozdzielające — nie kolapsują się w HTML

function renderTicker(messages: TickerItem[]): void {
  if (messages.length === 0) {
    tickerBar.classList.add('hidden');
    return;
  }
  tickerBar.classList.remove('hidden');
  const text = messages.map((m) => m.text).join(TICKER_SEP);
  // najpierw jedna kopia — mierzymy, czy w ogóle trzeba przewijać
  tickerA.textContent = text;
  tickerB.textContent = '';
  requestAnimationFrame(() => {
    if (tickerA.offsetWidth <= tickerBar.clientWidth) {
      // tryb statyczny: treść mieści się w pasku, bez duplikatu i bez animacji
      tickerB.textContent = '';
      tickerTrack.style.animation = 'none';
      return;
    }
    // tryb przewijania: druga kopia z separatorem na styku a→b, animacja do -50%
    tickerA.textContent = text + TICKER_SEP;
    tickerB.textContent = text + TICKER_SEP;
    const duration = Math.max(8, tickerA.offsetWidth / TICKER_SPEED_PX_S);
    // restart animacji od zera, żeby nie dziedziczyć ułamkowego postępu po zmianie treści
    tickerTrack.style.animation = 'none';
    void tickerTrack.offsetWidth;
    tickerTrack.style.animation = '';
    tickerTrack.style.animationDuration = `${duration}s`;
  });
}

const PANTRY_CLS: Record<string, string> = { ok: 'ok', low: 'warn', out: 'bad', unknown: 'unknown' };

function statusItem(text: string, cls: string): HTMLElement {
  const el = document.createElement('span');
  el.className = `status-item ${cls}`;
  el.textContent = text;
  return el;
}

function showerBadge(s: ShowerState): { label: string; cls: string } {
  if (s.occupancy === 'occupied') return { label: 'zajęty', cls: 'bad' };
  if (s.occupancy === 'free') return { label: 'wolny', cls: 'ok' };
  // czujników obecności jeszcze nie ma w HA — fallback na światło
  if (s.light === 'on') return { label: 'zajęty?', cls: 'warn' };
  if (s.light === 'off') return { label: 'wolny?', cls: 'ok' };
  return { label: '?', cls: 'unknown' };
}

function renderStatus(msg: StatusMessage): void {
  const pantry: [string, PantryItemState][] = [
    ['🧀 ser', msg.pantry.ser],
    ['🥛 mleko', msg.pantry.mleko],
    ['🍞 chleb', msg.pantry.chleb],
  ];
  statusPantry.replaceChildren(
    ...pantry.map(([label, item]) => statusItem(label, PANTRY_CLS[item.status] ?? 'unknown')),
  );
  const showers: [string, ShowerState][] = [
    ['qWWWetek', msg.showers.qwwwetek],
    ['qWWWetka', msg.showers.qwwwetka],
    ['WWWipownia', msg.showers.wwwipownia],
  ];
  statusShowers.replaceChildren(
    ...showers.map(([name, s]) => {
      const b = showerBadge(s);
      return statusItem(`🚿 ${name}: ${b.label}`, b.cls);
    }),
  );
}

// Szare „?" do czasu pierwszej wiadomości status.
renderStatus({
  type: 'status',
  pantry: {
    ser: { status: 'unknown', text: '?' },
    mleko: { status: 'unknown', text: '?' },
    chleb: { status: 'unknown', text: '?' },
  },
  showers: {
    qwwwetek: { light: 'unknown', occupancy: 'unknown' },
    qwwwetka: { light: 'unknown', occupancy: 'unknown' },
    wwwipownia: { light: 'unknown', occupancy: 'unknown', somtasma: 'unknown', somtasmaPreset: null },
  },
});

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
