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

export interface TickerItem { id: string; text: string; }

export interface StatusMessage {
  type: 'status';
  pantry: PantryData;
  showers: ShowersData;
}

export interface TickerMessage {
  type: 'ticker';
  messages: TickerItem[];
}

export type ServerMessage = StateMessage | HistoryMessage | PongMessage | StatusMessage | TickerMessage;

export interface PingMessage { type: 'ping'; t0: number; }
export interface PlayAdMessage { type: 'playAd'; }
export interface SkipMessage { type: 'skip'; }
export interface AddTickerMessage { type: 'addTicker'; text: string; }
export interface RemoveTickerMessage { type: 'removeTicker'; id: string; }
export type ClientMessage =
  | PingMessage
  | PlayAdMessage
  | SkipMessage
  | AddTickerMessage
  | RemoveTickerMessage;

export type PantryStatus = 'ok' | 'low' | 'out' | 'unknown';
export interface PantryItemState { status: PantryStatus; text: string; }
export interface PantryData {
  ser: PantryItemState;
  mleko: PantryItemState;
  chleb: PantryItemState;
}

export type ShowerLight = 'on' | 'off' | 'unknown';
export type ShowerOccupancy = 'occupied' | 'free' | 'unknown';
export interface ShowerState {
  light: ShowerLight;
  occupancy: ShowerOccupancy; // z czujnika obecności; 'unknown' dopóki czujników nie ma w HA
}
export interface WwwipowniaState extends ShowerState {
  somtasma: ShowerLight; // pasek LED
  somtasmaPreset: string | null; // nazwa presetu WLED albo null
}
export interface ShowersData {
  qwwwetek: ShowerState;
  qwwwetka: ShowerState;
  wwwipownia: WwwipowniaState;
}
