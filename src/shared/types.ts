export type ItemKind = 'image' | 'video' | 'ad' | 'special' | 'idle';

export interface StateItem {
  kind: ItemKind;
  url?: string; // /media/<plik> lub /ads/<plik>
  name?: string; // nazwa pliku lub id trybu
  specialId?: string;
  data?: unknown; // snapshot danych trybu specjalnego
  seed?: number;
}

export interface StateMessage {
  type: 'state';
  item: StateItem;
  startedAt: number; // epoch ms serwera
  duration: number; // ms; 0 dla idle
  newMem: boolean;
  serverNow: number;
  adsAvailable: boolean;
}

export interface HistoryEntry {
  kind: ItemKind;
  name: string;
  url?: string;
  playedAt: number;
  newMem: boolean;
}

export interface HistoryMessage {
  type: 'history';
  entries: HistoryEntry[]; // od najnowszego
}

export interface PongMessage {
  type: 'pong';
  t0: number;
  serverTime: number;
}

export type ServerMessage = StateMessage | HistoryMessage | PongMessage;

export interface PingMessage { type: 'ping'; t0: number; }
export interface PlayAdMessage { type: 'playAd'; }
export interface StopAdMessage { type: 'stopAd'; }
export type ClientMessage = PingMessage | PlayAdMessage | StopAdMessage;

export type PantryStatus = 'ok' | 'low' | 'out' | 'unknown';
export interface PantryItemState { status: PantryStatus; text: string; }
export interface PantryData {
  ser: PantryItemState;
  mleko: PantryItemState;
  chleb: PantryItemState;
}
