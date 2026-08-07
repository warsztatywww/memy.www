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
  autoAds: boolean;
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

// Wysyłana jako pierwsza po połączeniu. `bootId` jest losowany przy starcie
// procesu — jego zmiana po reconnekcie znaczy „serwer zaktualizowany, przeładuj się".
export interface HelloMessage {
  type: 'hello';
  bootId: string;
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

export type ServerMessage =
  | HelloMessage
  | StateMessage
  | HistoryMessage
  | PongMessage
  | StatusMessage
  | TickerMessage;

export interface PingMessage { type: 'ping'; t0: number; }
export interface PlayAdMessage { type: 'playAd'; }
export interface SkipMessage { type: 'skip'; }
export interface SetAutoAdsMessage { type: 'setAutoAds'; enabled: boolean; }
export interface AddTickerMessage { type: 'addTicker'; text: string; }
export interface RemoveTickerMessage { type: 'removeTicker'; id: string; }
export const REPORT_REASONS = [
  'To nie jest mem',
  'Jestem na tym zdjęciu i nie podoba mi się to',
  'Nie ma mnie na tym zdjęciu i nie podoba mi się to',
  'To jest mem Grzegorza',
  'Ten mem jest niezgodny z SOM',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export interface ReportMessage { type: 'report'; file: string; reason: ReportReason; }
export type ClientMessage =
  | PingMessage
  | PlayAdMessage
  | SkipMessage
  | SetAutoAdsMessage
  | AddTickerMessage
  | RemoveTickerMessage
  | ReportMessage;

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
  occupancy: ShowerOccupancy; // z czujnika PIR (wersja z podtrzymaniem); 'unknown' gdy nie odpowiada
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
