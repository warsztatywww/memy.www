import type { PantryData, PantryItemState, PantryStatus } from '../../shared/types';
import type { ClientSpecial } from './index';
import {
  BG, GREEN, MONO, MUTED, RED, TEXT, YELLOW,
  drawPill, drawRoom, drawUnknownTag, letterSpacing, roundRect,
} from './scene';

const PILL: Record<Exclude<PantryStatus, 'unknown'>, { color: string; dot: string; text: string; label: string }> = {
  ok: { color: GREEN, dot: '#06251A', text: '#06251A', label: 'JEST!' },
  low: { color: YELLOW, dot: '#4A3E08', text: '#4A3E08', label: 'MAŁO' },
  out: { color: RED, dot: '#FFD3D8', text: '#FFFFFF', label: 'BRAK' },
};
const NAME_COLOR: Record<PantryStatus, string> = {
  ok: GREEN, low: YELLOW, out: RED, unknown: MUTED,
};

const UNKNOWN: PantryItemState = { status: 'unknown', text: '???' };

// pulsujący czerwony alarm w miejscu, gdzie czegoś brakuje
function alarmGlow(ctx: CanvasRenderingContext2D, t: number, cx: number, cy: number, r: number): void {
  const a = 0.22 * (0.5 + 0.5 * Math.sin(t / 120));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255, 77, 94, ${a})`);
  g.addColorStop(1, 'rgba(255, 77, 94, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

// klin sera z dziurami
function drawCheese(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, ht: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + wd, y);
  ctx.lineTo(x + wd * 0.78, y - ht);
  ctx.closePath();
  ctx.fillStyle = '#F2C94C';
  ctx.fill();
  ctx.strokeStyle = '#C79A2F';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#D9A93E';
  ctx.beginPath();
  ctx.arc(x + wd * 0.38, y - ht * 0.28, ht * 0.15, 0, Math.PI * 2);
  ctx.arc(x + wd * 0.62, y - ht * 0.12, ht * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

// kromka tosta stojąca na blacie, lekko przechylona
function drawToast(ctx: CanvasRenderingContext2D, x: number, baseY: number, sw: number, sh: number, tilt: number): void {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.rotate(tilt);
  ctx.fillStyle = '#EFCB8F';
  ctx.strokeStyle = '#B98A4B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-sw / 2, -sh, sw, sh, [sw * 0.5, sw * 0.5, sw * 0.1, sw * 0.1]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// duży karton mleka: szczytowy daszek, niebieski pas z napisem
function drawCarton(ctx: CanvasRenderingContext2D, h: number, x: number, floorY: number, cw: number, ch: number): void {
  const y = floorY - ch;
  const gable = h * 0.032;
  ctx.fillStyle = '#C9D6DC';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + cw / 2, y - gable);
  ctx.lineTo(x + cw, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#9DAEB6';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#DCE7EC';
  roundRect(ctx, x, y, cw, ch, h * 0.004);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3E7CB8';
  ctx.fillRect(x, y + ch * 0.34, cw, ch * 0.2);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${h * 0.017}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MLEKO', x + cw / 2, y + ch * 0.44, cw * 0.9);
}

export const pantrySpecial: ClientSpecial = {
  id: 'pantry',
  previewData: {
    ser: { status: 'ok', text: 'Otóż TAK!!!' },
    mleko: { status: 'low', text: 'Już prawie nie ma' },
    chleb: { status: 'out', text: 'GŁODÓWKA NIE MA TOSTÓW!!!!!!!!!!!!1111111jedenjeden' },
  } satisfies PantryData,

  render(ctx, t, w, h, rawData): void {
    const data = rawData as PantryData | null;
    const ser = data ? data.ser : UNKNOWN;
    const mleko = data ? data.mleko : UNKNOWN;
    const chleb = data ? data.chleb : UNKNOWN;
    const floorY = h * 0.85;
    const anyOut = [ser, mleko, chleb].some((s) => s.status === 'out');

    // podkład pod trzęsienie — przesunięta scena nie odsłania śmieci po bokach
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    if (anyOut) ctx.translate(Math.sin(t / 30) * h * 0.008, Math.cos(t / 37) * h * 0.008);

    drawRoom(ctx, w, h, floorY);

    // zwykła żarówka na kablu zamiast neonu — kołysze się leniwie
    const swing = 0.025 * Math.sin(t / 1400);
    const bulbX = w * 0.37 + Math.sin(swing) * h * 0.3;
    const bulbY = Math.cos(swing) * h * 0.3;
    ctx.strokeStyle = '#2A343A';
    ctx.lineWidth = Math.max(2, h * 0.0035);
    ctx.beginPath();
    ctx.moveTo(w * 0.37, 0);
    ctx.lineTo(bulbX, bulbY);
    ctx.stroke();
    ctx.fillStyle = '#3A464E';
    roundRect(ctx, bulbX - w * 0.006, bulbY, w * 0.012, h * 0.018, w * 0.002);
    ctx.fill();
    const flicker = 0.94 + 0.06 * Math.sin(t / 210);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 205, 130, 0.9)';
    ctx.shadowBlur = h * 0.04 * flicker;
    ctx.fillStyle = '#FFE9BE';
    ctx.beginPath();
    ctx.arc(bulbX, bulbY + h * 0.036, h * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // ciepła plama światła na scenie
    const pool = ctx.createRadialGradient(bulbX, bulbY + h * 0.036, 0, bulbX, bulbY + h * 0.036, w * 0.5);
    pool.addColorStop(0, `rgba(255, 205, 130, ${0.1 * flicker})`);
    pool.addColorStop(1, 'rgba(255, 205, 130, 0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);

    // nagłówek: zwykły napis w świetle żarówki
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F2E9DA';
    ctx.font = `bold ${h * 0.07}px system-ui, sans-serif`;
    ctx.fillText('CZY JEST...?', w / 2, h * 0.082);
    ctx.fillStyle = MUTED;
    ctx.font = `${h * 0.026}px ${MONO}`;
    letterSpacing(ctx, h * 0.012);
    ctx.fillText('STATUS SPIŻARNI', w / 2, h * 0.152);
    letterSpacing(ctx, 0);

    // ── lodówka z serem ──────────────────────────────────────────────
    const fx = w * 0.09;
    const fw = w * 0.19;
    const ftop = h * 0.4;
    const fh = floorY - ftop;
    const fcx = fx + fw / 2;
    const body = ctx.createLinearGradient(fx, 0, fx + fw, 0);
    body.addColorStop(0, '#C9D5DB');
    body.addColorStop(1, '#A2B0B8');
    ctx.fillStyle = body;
    roundRect(ctx, fx, ftop, fw, fh, h * 0.012);
    ctx.fill();
    ctx.strokeStyle = '#8FA0A8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (ser.status === 'unknown') {
      // zamknięte drzwi: uchwyt i zawieszka „?"
      ctx.fillStyle = '#6E7F87';
      roundRect(ctx, fx + fw * 0.08, ftop + fh * 0.22, w * 0.006, fh * 0.24, w * 0.003);
      ctx.fill();
      drawUnknownTag(ctx, h, fcx, ftop + fh * 0.45);
    } else {
      // otwarte drzwi: skrzydło obok, w środku półki podświetlone lampką
      ctx.fillStyle = '#AEBCC3';
      roundRect(ctx, fx - w * 0.03, ftop + h * 0.008, w * 0.026, fh * 0.96, h * 0.008);
      ctx.fill();
      ctx.strokeStyle = '#8FA0A8';
      ctx.stroke();
      const cavX = fx + w * 0.014;
      const cavY = ftop + h * 0.014;
      const cavW = fw - w * 0.028;
      const cavH = fh - h * 0.028;
      ctx.fillStyle = '#1A2B34';
      roundRect(ctx, cavX, cavY, cavW, cavH, h * 0.008);
      ctx.fill();
      const inner = ctx.createLinearGradient(0, cavY, 0, cavY + cavH);
      inner.addColorStop(0, 'rgba(255, 240, 215, 0.4)');
      inner.addColorStop(1, 'rgba(255, 240, 215, 0.06)');
      ctx.fillStyle = inner;
      roundRect(ctx, cavX, cavY, cavW, cavH, h * 0.008);
      ctx.fill();
      const shelf1 = cavY + cavH * 0.4;
      const shelf2 = cavY + cavH * 0.72;
      ctx.strokeStyle = '#4C6470';
      ctx.lineWidth = Math.max(3, h * 0.004);
      ctx.beginPath();
      ctx.moveTo(cavX, shelf1);
      ctx.lineTo(cavX + cavW, shelf1);
      ctx.moveTo(cavX, shelf2);
      ctx.lineTo(cavX + cavW, shelf2);
      ctx.stroke();

      const wd = w * 0.05;
      const ht = h * 0.042;
      if (ser.status === 'ok') {
        // pełna lodówka: blok sera i kliny na obu półkach
        ctx.fillStyle = '#E8BC45';
        roundRect(ctx, cavX + cavW * 0.08, shelf1 - h * 0.05, cavW * 0.3, h * 0.046, h * 0.006);
        ctx.fill();
        ctx.strokeStyle = '#C79A2F';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        drawCheese(ctx, cavX + cavW * 0.5, shelf1 - h * 0.004, wd, ht);
        drawCheese(ctx, cavX + cavW * 0.14, shelf2 - h * 0.004, wd, ht);
        drawCheese(ctx, cavX + cavW * 0.55, shelf2 - h * 0.004, wd * 0.8, ht * 0.8);
      } else if (ser.status === 'low') {
        drawCheese(ctx, cavX + cavW * 0.38, shelf2 - h * 0.004, wd * 0.65, ht * 0.65);
      } else {
        alarmGlow(ctx, t, fcx, cavY + cavH * 0.5, cavW * 0.8);
      }
    }
    if (ser.status !== 'unknown') {
      const p = PILL[ser.status];
      drawPill(ctx, t, h, fcx, floorY - h * 0.05, fw * 0.7, h * 0.052, p.color, p.dot, p.text, p.label, ser.status === 'out');
    }

    // ── stół z chlebem tostowym, mleko w kartonach pod spodem ────────
    const tx = w * 0.44;
    const tw = w * 0.44;
    const topY = h * 0.56;
    const thick = h * 0.028;
    const legW = w * 0.014;
    ctx.fillStyle = '#6B4526';
    ctx.fillRect(tx + w * 0.015, topY + thick, legW, floorY - topY - thick);
    ctx.fillRect(tx + tw - w * 0.015 - legW, topY + thick, legW, floorY - topY - thick);
    // belka usztywniająca pod blatem
    ctx.fillStyle = '#5C3B21';
    ctx.fillRect(tx + w * 0.015 + legW, topY + thick, tw - (w * 0.015 + legW) * 2, h * 0.014);
    const plank = ctx.createLinearGradient(0, topY, 0, topY + thick);
    plank.addColorStop(0, '#96683F');
    plank.addColorStop(1, '#6E4A2B');
    ctx.fillStyle = plank;
    roundRect(ctx, tx, topY, tw, thick, h * 0.006);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 170, 0.25)';
    ctx.fillRect(tx, topY, tw, Math.max(1.5, h * 0.002));

    // chleb tostowy na blacie
    const bx = tx + tw * 0.32;
    const sw = w * 0.03;
    const sh = h * 0.06;
    if (chleb.status === 'ok') {
      for (let i = 0; i < 4; i++) drawToast(ctx, bx + i * w * 0.02, topY, sw, sh, -0.08 + i * 0.05);
    } else if (chleb.status === 'low') {
      drawToast(ctx, bx + w * 0.02, topY, sw, sh, 0.06);
    } else if (chleb.status === 'out') {
      alarmGlow(ctx, t, bx + w * 0.03, topY - h * 0.05, w * 0.09);
      // okruszki po ostatnim toście
      ctx.fillStyle = '#B98A4B';
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        ctx.beginPath();
        ctx.arc(bx + w * 0.03 + Math.sin(a) * w * 0.032, topY - h * 0.006 + Math.cos(a * 1.7) * h * 0.004, h * 0.0025, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      drawUnknownTag(ctx, h, bx + w * 0.03, topY - h * 0.06, h * 0.026);
    }
    if (chleb.status !== 'unknown') {
      const p = PILL[chleb.status];
      drawPill(ctx, t, h, bx + w * 0.03, topY - h * 0.115, w * 0.105, h * 0.052, p.color, p.dot, p.text, p.label, chleb.status === 'out');
    }

    // mleko: duże kartony na podłodze pod stołem
    const cartonW = w * 0.05;
    const cartonH = h * 0.17;
    const mcx = w * 0.62;
    if (mleko.status === 'ok') {
      for (let i = 0; i < 3; i++) drawCarton(ctx, h, mcx - cartonW * 1.7 + i * cartonW * 1.2, floorY, cartonW, cartonH);
    } else if (mleko.status === 'low') {
      drawCarton(ctx, h, mcx - cartonW / 2, floorY, cartonW, cartonH);
    } else if (mleko.status === 'out') {
      alarmGlow(ctx, t, mcx, floorY - h * 0.08, w * 0.09);
    } else {
      drawUnknownTag(ctx, h, mcx, floorY - h * 0.09, h * 0.026);
    }
    if (mleko.status !== 'unknown') {
      const p = PILL[mleko.status];
      drawPill(ctx, t, h, w * 0.79, floorY - h * 0.045, w * 0.1, h * 0.052, p.color, p.dot, p.text, p.label, mleko.status === 'out');
    }

    // odbicia w podłodze
    const refl = ctx.createLinearGradient(0, floorY, 0, floorY + h * 0.1);
    refl.addColorStop(0, 'rgba(140, 180, 200, 0.05)');
    refl.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = refl;
    ctx.fillRect(fx, floorY + h * 0.004, fw, h * 0.096);
    ctx.fillRect(tx, floorY + h * 0.004, tw, h * 0.096);

    // pasek na dole: nazwa i dopisek z panelu dla każdej pozycji
    const cols: { label: string; st: PantryItemState; x: number }[] = [
      { label: 'SER', st: ser, x: w * 0.19 },
      { label: 'CHLEB TOSTOWY', st: chleb, x: w * 0.52 },
      { label: 'MLEKO', st: mleko, x: w * 0.8 },
    ];
    for (const col of cols) {
      ctx.fillStyle = NAME_COLOR[col.st.status];
      ctx.font = `bold ${h * 0.022}px ${MONO}`;
      letterSpacing(ctx, h * 0.006);
      ctx.fillText(col.label, col.x, h * 0.895);
      letterSpacing(ctx, 0);
      ctx.fillStyle = TEXT;
      ctx.font = `${h * 0.027}px system-ui, sans-serif`;
      ctx.fillText(col.st.text, col.x, h * 0.933, w * 0.28);
    }

    ctx.restore();
  },
};
