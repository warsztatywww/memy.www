import type { ShowerLight, ShowerOccupancy, ShowersData } from '../../shared/types';
import type { SpecialMode } from './index';

const HA_URL = 'http://smart.www22.duck.edu.pl';
const FETCH_TIMEOUT_MS = 3000;

const LIGHTS = {
  qwwwetek: 'switch.qwwwetek',
  qwwwetka: 'switch.qwwwetka',
  wwwipownia: 'switch.vipownia_wwwipownia',
} as const;

// Czujniki obecności (PIR). Uwaga: ID nie zgadzają się z kabinami — rozstrzyga
// friendly_name w HA („qWWWetek sensor Motion" = pir_t1_3_motion_2 itd.).
const PRESENCE = {
  qwwwetek: 'binary_sensor.pir_t1_3_motion_2',
  qwwwetka: 'binary_sensor.pir_t1_2_motion',
  wwwipownia: 'binary_sensor.pir_t1_3_motion',
} as const;

const SOMTASMA_LIGHT = 'light.somtasma';
const SOMTASMA_PRESET = 'select.somtasma_preset';

interface HAState {
  entity_id: string;
  state: string;
}

function toLight(state: string | undefined): ShowerLight {
  return state === 'on' || state === 'off' ? state : 'unknown';
}

function toOccupancy(state: string | undefined): ShowerOccupancy {
  if (state === 'on') return 'occupied';
  if (state === 'off') return 'free';
  return 'unknown';
}

const UNKNOWN_DATA: ShowersData = {
  qwwwetek: { light: 'unknown', occupancy: 'unknown' },
  qwwwetka: { light: 'unknown', occupancy: 'unknown' },
  wwwipownia: { light: 'unknown', occupancy: 'unknown', somtasma: 'unknown', somtasmaPreset: null },
};

export function createShowersSpecial(token: string, fetchFn: typeof fetch = fetch): SpecialMode {
  return {
    id: 'showers',
    duration: 15_000,
    async fetchData(): Promise<ShowersData> {
      let states: Map<string, string>;
      try {
        const res = await fetchFn(`${HA_URL}/api/states`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = (await res.json()) as HAState[];
        states = new Map(raw.map((s) => [s.entity_id, s.state]));
      } catch {
        return structuredClone(UNKNOWN_DATA);
      }
      const preset = states.get(SOMTASMA_PRESET);
      return {
        qwwwetek: {
          light: toLight(states.get(LIGHTS.qwwwetek)),
          occupancy: toOccupancy(states.get(PRESENCE.qwwwetek)),
        },
        qwwwetka: {
          light: toLight(states.get(LIGHTS.qwwwetka)),
          occupancy: toOccupancy(states.get(PRESENCE.qwwwetka)),
        },
        wwwipownia: {
          light: toLight(states.get(LIGHTS.wwwipownia)),
          occupancy: toOccupancy(states.get(PRESENCE.wwwipownia)),
          somtasma: toLight(states.get(SOMTASMA_LIGHT)),
          somtasmaPreset: preset == null || preset === 'unknown' || preset === 'unavailable' ? null : preset,
        },
      };
    },
  };
}
