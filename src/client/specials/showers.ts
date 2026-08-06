import type { ShowersData, ShowerState } from '../../shared/types';
import type { ClientSpecial } from './index';

const CABINS: { key: keyof ShowersData; label: string; sub?: string; x: number; w: number }[] = [
  // qWWWetek i qWWWetka sklejone (wspólna ściana), WWWIPownia osobno obok
  { key: 'qwwwetek', label: 'qWWWetek', x: 0.05, w: 0.29 },
  { key: 'qwwwetka', label: 'qWWWetka', x: 0.34, w: 0.29 },
  { key: 'wwwipownia', label: 'WWWIPownia', sub: '„KONFESJONAŁ"', x: 0.69, w: 0.26 },
];

const GREEN = '#3fbf5f';
const RED = '#e63946';
const UNKNOWN_STATE: ShowerState = { light: 'unknown', occupancy: 'unknown' };

export const showersSpecial: ClientSpecial = {
  id: 'showers',
  previewData: {
    qwwwetek: { light: 'on', occupancy: 'occupied' },
    qwwwetka: { light: 'off', occupancy: 'free' },
    wwwipownia: { light: 'on', occupancy: 'unknown', somtasma: 'on', somtasmaPreset: 'Rainbow' },
  } satisfies ShowersData,

  render(ctx, t, w, h, rawData): void {
    const data = rawData as ShowersData | null;
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${h * 0.09}px system-ui, sans-serif`;
    ctx.fillText('qWWWη', w / 2, h * 0.1);
    ctx.fillStyle = '#99aabb';
    ctx.font = `${h * 0.035}px system-ui, sans-serif`;
    ctx.fillText('STATUS PRYSZNICÓW', w / 2, h * 0.18);

    const top = h * 0.26;
    const bottom = h * 0.9;

    for (const cabin of CABINS) {
      const st: ShowerState = data ? data[cabin.key] : UNKNOWN_STATE;
      const x = cabin.x * w;
      const cw = cabin.w * w;
      const cx = x + cw / 2;

      // somtaśma: animowana ramka LED wokół konfesjonału
      if (cabin.key === 'wwwipownia' && data?.wwwipownia.somtasma === 'on') {
        ctx.save();
        ctx.strokeStyle = `hsl(${(t / 5) % 360}, 90%, 60%)`;
        ctx.lineWidth = 6;
        ctx.setLineDash([18, 12]);
        ctx.lineDashOffset = -t / 8;
        ctx.strokeRect(x - 8, top - 8, cw + 16, bottom - top + 16);
        ctx.restore();
      }

      // kabina
      ctx.strokeStyle = '#555566';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, top, cw, bottom - top);

      // nazwa
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${h * 0.038}px system-ui, sans-serif`;
      ctx.fillText(cabin.label, cx, top + h * 0.06);
      if (cabin.sub) {
        ctx.fillStyle = '#99aabb';
        ctx.font = `italic ${h * 0.026}px system-ui, sans-serif`;
        ctx.fillText(cabin.sub, cx, top + h * 0.11);
      }

      // światło: 💡 pulsujące gdy on, przygaszone gdy off, ❓ gdy unknown
      const lightY = top + (bottom - top) * 0.45;
      ctx.save();
      ctx.font = `${h * 0.11}px system-ui, sans-serif`;
      if (st.light === 'on') {
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t / 200);
        ctx.fillText('💡', cx, lightY);
      } else if (st.light === 'off') {
        ctx.globalAlpha = 0.25;
        ctx.fillText('💡', cx, lightY);
      } else {
        ctx.fillText('❓', cx, lightY);
      }
      ctx.restore();

      // badge zajętości — tylko gdy czujnik daje odczyt
      if (st.occupancy !== 'unknown') {
        const occupied = st.occupancy === 'occupied';
        // ZAJĘTY miga, WOLNY świeci ciągle
        if (!occupied || Math.sin(t / 120) > -0.5) {
          const by = bottom - h * 0.09;
          const bw = cw * 0.7;
          const bh = h * 0.07;
          ctx.fillStyle = occupied ? RED : GREEN;
          ctx.fillRect(cx - bw / 2, by - bh / 2, bw, bh);
          ctx.fillStyle = '#101018';
          ctx.font = `bold ${h * 0.035}px system-ui, sans-serif`;
          ctx.fillText(occupied ? 'ZAJĘTY' : 'WOLNY', cx, by);
        }
      }

      // nazwa presetu somtaśmy
      if (cabin.key === 'wwwipownia' && data?.wwwipownia.somtasmaPreset) {
        ctx.fillStyle = '#99aabb';
        ctx.font = `${h * 0.024}px system-ui, sans-serif`;
        ctx.fillText(`✨ ${data.wwwipownia.somtasmaPreset}`, cx, bottom - h * 0.03, cw * 0.9);
      }
    }
  },
};
