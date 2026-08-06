import type { PantryData, PantryItemState } from '../../shared/types';
import type { ClientSpecial } from './index';

const ROWS: { key: keyof PantryData; emoji: string; label: string }[] = [
  { key: 'ser', emoji: '🧀', label: 'SER' },
  { key: 'mleko', emoji: '🥛', label: 'MLEKO' },
  { key: 'chleb', emoji: '🍞', label: 'CHLEB TOSTOWY' },
];

const COLORS = { ok: '#3fbf5f', low: '#e6c229', out: '#e63946', unknown: '#888888' } as const;
const UNKNOWN: PantryItemState = { status: 'unknown', text: '???' };

export const pantrySpecial: ClientSpecial = {
  id: 'pantry',
  previewData: {
    ser: { status: 'ok', text: 'Otóż TAK!!!' },
    mleko: { status: 'low', text: 'Już prawie nie ma' },
    chleb: { status: 'out', text: 'GŁODÓWKA NIE MA TOSTÓW!!!!!!!!!!!!1111111jedenjeden' },
  } satisfies PantryData,

  render(ctx, t, w, h, rawData): void {
    const data = rawData as PantryData | null;
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, w, h);

    const anyOut = data !== null && ROWS.some((r) => data[r.key].status === 'out');
    ctx.save();
    if (anyOut) ctx.translate(Math.sin(t / 30) * 6, Math.cos(t / 37) * 6);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${h * 0.08}px system-ui, sans-serif`;
    ctx.fillText('CZY JEST...?', w / 2, h * 0.11);

    ROWS.forEach((row, i) => {
      const y = h * (0.3 + i * 0.24);
      const st = data ? data[row.key] : UNKNOWN;
      const color = COLORS[st.status];

      if (st.status === 'out' && Math.sin(t / 80) > 0) {
        ctx.fillStyle = 'rgba(230, 57, 70, 0.25)';
        ctx.fillRect(0, y - h * 0.1, w, h * 0.2);
      }
      ctx.globalAlpha = st.status === 'low' ? (Math.sin(t / 150) > 0 ? 1 : 0.35) : 1;

      const pulse = st.status === 'ok' ? 1 + 0.05 * Math.sin(t / 300 + i * 2) : 1;
      ctx.font = `${h * 0.11 * pulse}px system-ui, sans-serif`;
      ctx.fillText(st.status === 'unknown' ? '❓' : row.emoji, w * 0.14, y);

      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.font = `bold ${h * 0.05}px system-ui, sans-serif`;
      ctx.fillText(row.label, w * 0.24, y - h * 0.035);
      ctx.fillStyle = '#ffffff';
      ctx.font = `${h * 0.032}px system-ui, sans-serif`;
      ctx.fillText(st.text, w * 0.24, y + h * 0.045, w * 0.72);
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  },
};
