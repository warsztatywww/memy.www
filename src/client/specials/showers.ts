import type { ShowersData, ShowerState } from '../../shared/types';
import type { ClientSpecial } from './index';
import {
  CHROME, GREEN, MONO, MUTED, RED, TEXT,
  drawNeonHeader, drawPill, drawRoom, drawUnknownTag, roundRect,
} from './scene';

interface Cabin {
  key: keyof ShowersData;
  label: string;
  sub?: string;
  x: number;
  w: number;
  // zasłonka: jednolity kolor (zapalone/zgaszone światło) albo tęczowe paski
  curtain: { on: string; off: string } | 'rainbow';
}

const CABINS: Cabin[] = [
  // qWWWetek i qWWWetka sklejone (wspólna rama), WWWIPownia osobno obok
  { key: 'qwwwetek', label: 'qWWWetek', x: 0.05, w: 0.29, curtain: { on: '#9FC6EA', off: '#54718C' } },
  { key: 'qwwwetka', label: 'qWWWetka', x: 0.34, w: 0.29, curtain: { on: '#F2B3CB', off: '#8A5F73' } },
  { key: 'wwwipownia', label: 'WWWIPownia', sub: '„KONFESJONAŁ"', x: 0.69, w: 0.26, curtain: 'rainbow' },
];

const ROD = '#16191C'; // czarne pręty stalowe
const ROD_SHINE = '#3D474F';
const PEBBLES = ['#5A6A72', '#4A575E', '#6B7B84', '#3E4A50'] as const;
const FOLDS = 8;

const UNKNOWN_STATE: ShowerState = { light: 'unknown', occupancy: 'unknown' };

// pręt stalowy: czarny z wąskim blikiem wzdłuż lewej krawędzi
function rod(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, lw: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = ROD;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = ROD_SHINE;
  ctx.lineWidth = Math.max(1, lw * 0.25);
  ctx.beginPath();
  ctx.moveTo(x1 - lw * 0.22, y1);
  ctx.lineTo(x2 - lw * 0.22, y2);
  ctx.stroke();
}

// para: kłęby wznoszące się nad kabiną
function drawSteam(
  ctx: CanvasRenderingContext2D, t: number, h: number,
  ix: number, iw: number, top: number, rng: () => number,
): void {
  for (let i = 0; i < 4; i++) {
    const px = rng();
    const speed = 0.8 + 0.4 * rng();
    const phase = rng();
    const p = ((t / 4200) * speed + phase) % 1;
    const x = ix + (0.2 + 0.6 * px) * iw + Math.sin(t / 700 + phase * 6.28) * iw * 0.05;
    const y = top - p * h * 0.13;
    const r = h * (0.022 + 0.036 * p);
    const alpha = 0.16 * (1 - p) * Math.min(1, p / 0.08);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(235, 245, 250, ${alpha})`);
    g.addColorStop(1, 'rgba(235, 245, 250, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export const showersSpecial: ClientSpecial = {
  id: 'showers',
  previewData: {
    qwwwetek: { light: 'on', occupancy: 'occupied' },
    qwwwetka: { light: 'off', occupancy: 'free' },
    wwwipownia: { light: 'on', occupancy: 'unknown', somtasma: 'on', somtasmaPreset: 'Rainbow' },
  } satisfies ShowersData,

  render(ctx, t, w, h, rawData, rng): void {
    const data = rawData as ShowersData | null;
    const top = h * 0.27;
    const floorY = h * 0.85;

    drawRoom(ctx, w, h, floorY);
    drawNeonHeader(ctx, t, w, h, 'qWWWη', 'STATUS PRYSZNICÓW');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cabin of CABINS) {
      const st: ShowerState = data ? data[cabin.key] : UNKNOWN_STATE;
      const x = cabin.x * w;
      const cw = cabin.w * w;
      const cx = x + cw / 2;
      const rodW = Math.max(4, w * 0.005);
      const ix = x + rodW;
      const iw = cw - rodW * 2;
      const railY = top + h * 0.095; // drążek zasłonki, poniżej głowicy
      const hemY = floorY - h * 0.09; // dół zasłonki — szczelina nad żwirem
      const lightOn = st.light === 'on';
      const phase = cabin.x * 40;

      if (lightOn) drawSteam(ctx, t, h, ix, iw, top, rng);

      // somtaśma: animowana ramka LED wokół konfesjonału
      const isKonfesjonal = cabin.key === 'wwwipownia';
      if (isKonfesjonal && data?.wwwipownia.somtasma === 'on') {
        const hue = (t / 5) % 360;
        // tęcza przesuwająca się wzdłuż ramki
        const grad = ctx.createLinearGradient(x, floorY, x + cw, top);
        for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${(hue + i * 60) % 360}, 90%, 60%)`);
        ctx.save();
        ctx.lineWidth = 5;
        ctx.setLineDash([18, 12]);
        ctx.lineDashOffset = -t / 8;
        ctx.shadowColor = `hsl(${hue}, 90%, 60%)`;
        ctx.shadowBlur = h * 0.02;
        ctx.strokeStyle = grad;
        const m = h * 0.014;
        roundRect(ctx, x - m, top - m, cw + m * 2, floorY - top + m * 2, m);
        ctx.stroke();
        ctx.restore();
      }

      // łuna w środku kabiny — prześwituje nad i pod zasłonką
      if (lightOn) {
        const flicker = 0.92 + 0.08 * Math.sin(t / 163 + phase);
        const g = ctx.createLinearGradient(0, top, 0, floorY);
        g.addColorStop(0, `rgba(255, 190, 90, ${0.3 * flicker})`);
        g.addColorStop(1, `rgba(255, 170, 60, ${0.08 * flicker})`);
        ctx.fillStyle = g;
        ctx.fillRect(ix, top, iw, floorY - top);
      } else {
        ctx.fillStyle = 'rgba(8, 18, 24, 0.5)';
        ctx.fillRect(ix, top, iw, floorY - top);
      }

      // głowica prysznicowa na rurce pod górnym prętem
      const headW = iw * 0.24;
      const headY = top + h * 0.045;
      ctx.strokeStyle = CHROME;
      ctx.lineWidth = Math.max(2, h * 0.004);
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, headY - h * 0.008);
      ctx.stroke();
      ctx.fillStyle = CHROME;
      roundRect(ctx, cx - headW / 2, headY - h * 0.008, headW, h * 0.014, h * 0.007);
      ctx.fill();

      // strugi wody: spod głowicy do zasłonki i w szczelinie nad żwirem
      if (lightOn) {
        ctx.strokeStyle = 'rgba(190, 225, 245, 0.35)';
        ctx.lineWidth = Math.max(1.5, h * 0.002);
        const fallTop = headY + h * 0.01;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const sx = cx - headW * 0.6 + rng() * headW * 1.2;
          const speed = 0.8 + 0.4 * rng();
          const phi = rng();
          const yFrac = ((t * 0.00035) * speed + phi) % 1;
          const sy = fallTop + yFrac * (floorY - fallTop);
          const segEnd = Math.min(sy + h * 0.045, floorY);
          // środek toru zakrywa zasłonka — rysujemy tylko widoczne odcinki
          if (sy < railY) {
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx, Math.min(segEnd, railY + h * 0.01));
          } else if (segEnd > hemY) {
            ctx.moveTo(sx, Math.max(sy, hemY));
            ctx.lineTo(sx, segEnd);
          }
        }
        ctx.stroke();
      }

      // żwir wysypany na dole kabiny: miękki cień + luźno rozsypane kamyki
      const shadow = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, iw * 0.6);
      shadow.addColorStop(0, 'rgba(4, 9, 12, 0.55)');
      shadow.addColorStop(1, 'rgba(4, 9, 12, 0)');
      ctx.save();
      ctx.translate(cx, floorY);
      ctx.scale(1, 0.1);
      ctx.translate(-cx, -floorY);
      ctx.fillStyle = shadow;
      ctx.fillRect(cx - iw * 0.6, floorY - iw * 0.6, iw * 1.2, iw * 1.2);
      ctx.restore();
      for (let i = 0; i < 48; i++) {
        // kupka gęsta w środku, pojedyncze kamyki rozsypane szerzej
        const spread = rng();
        const px = cx + (spread - 0.5) * iw * (rng() < 0.15 ? 1.25 : 1.02);
        const py = floorY - h * 0.012 + rng() * h * 0.024;
        const r = h * (0.0035 + 0.0045 * rng());
        ctx.fillStyle = PEBBLES[Math.floor(rng() * PEBBLES.length)];
        ctx.beginPath();
        ctx.ellipse(px, py, r * 1.3, r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (lightOn) {
        ctx.fillStyle = 'rgba(255, 190, 90, 0.08)';
        ctx.fillRect(ix, floorY - h * 0.018, iw, h * 0.034);
        // rozbryzgi na kamykach
        ctx.fillStyle = 'rgba(220, 240, 250, 0.9)';
        for (let i = 0; i < 5; i++) {
          const sx = cx + (rng() - 0.5) * headW * 1.4;
          const phi = rng() * 6.28;
          ctx.globalAlpha = 0.3 * (0.5 + 0.5 * Math.sin(t / 90 + phi));
          ctx.beginPath();
          ctx.arc(sx, floorY - h * 0.014, h * 0.002, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // konstrukcja: czarne pręty stalowe — słupki i dwa drążki
      rod(ctx, x + rodW / 2, top, x + rodW / 2, floorY + h * 0.008, rodW);
      rod(ctx, x + cw - rodW / 2, top, x + cw - rodW / 2, floorY + h * 0.008, rodW);
      rod(ctx, x, top, x + cw, top, rodW * 0.85);
      rod(ctx, ix, railY, ix + iw, railY, rodW * 0.7);

      // zasłonka: kolor własny kabiny, fałdy cieniowane, falujący dół
      const cX0 = ix + iw * 0.05;
      const cX1 = ix + iw * 0.95;
      const sway = 0.5 + 0.5 * Math.sin(t / 1100 + phase);
      let base: string | CanvasGradient;
      if (cabin.curtain === 'rainbow') {
        // tęczowa w pionowe paski — pasek na każdą fałdę
        const stripes = ctx.createLinearGradient(cX0, 0, cX1, 0);
        for (let i = 0; i < FOLDS; i++) {
          const color = `hsl(${(i * 360) / FOLDS}, ${lightOn ? 75 : 30}%, ${lightOn ? 66 : 42}%)`;
          stripes.addColorStop(i / FOLDS, color);
          stripes.addColorStop(Math.min(1, (i + 1) / FOLDS - 0.001), color);
        }
        base = stripes;
      } else {
        base = lightOn ? cabin.curtain.on : cabin.curtain.off;
      }
      const amp = h * 0.008;
      ctx.beginPath();
      ctx.moveTo(cX0, railY + h * 0.006);
      ctx.lineTo(cX0, hemY);
      const segs = 14;
      for (let i = 1; i <= segs; i++) {
        const u = i / segs;
        ctx.lineTo(cX0 + u * (cX1 - cX0), hemY + amp * Math.sin(u * 12 + t / 700 + phase));
      }
      ctx.lineTo(cX1, railY + h * 0.006);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.globalAlpha = 0.96;
      ctx.fill();
      // cień fałd na wierzchu koloru — wspólny dla gładkich i pasiastych
      const pleats = ctx.createLinearGradient(cX0, 0, cX1, 0);
      for (let i = 0; i < FOLDS; i++) {
        pleats.addColorStop(i / FOLDS, 'rgba(6, 12, 18, 0)');
        pleats.addColorStop(Math.min(1, (i + 0.35 + 0.2 * sway) / FOLDS), `rgba(6, 12, 18, ${lightOn ? 0.28 : 0.38})`);
      }
      ctx.fillStyle = pleats;
      ctx.fill();
      ctx.globalAlpha = 1;

      // kółka na drążku
      ctx.strokeStyle = '#4A555C';
      ctx.lineWidth = Math.max(1.5, h * 0.0025);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rx = cX0 + ((i + 0.5) / 8) * (cX1 - cX0);
        ctx.moveTo(rx + h * 0.007, railY);
        ctx.arc(rx, railY, h * 0.007, 0, Math.PI * 2);
      }
      ctx.stroke();

      // zawieszka „?" gdy stan światła nieznany
      if (st.light === 'unknown') {
        drawUnknownTag(ctx, h, cx, railY + (hemY - railY) * 0.35);
      }

      // wskaźnik zajętości zawieszony na zasłonce — tylko gdy czujnik daje odczyt
      if (st.occupancy !== 'unknown') {
        const occupied = st.occupancy === 'occupied';
        drawPill(
          ctx, t, h, cx, hemY - h * 0.06, iw * 0.62, h * 0.062,
          occupied ? RED : GREEN,
          occupied ? '#FFD3D8' : '#06251A',
          occupied ? '#FFFFFF' : '#06251A',
          occupied ? 'ZAJĘTY' : 'WOLNY',
          occupied,
        );
      }

      // odbicie łuny w mokrej podłodze
      const refl = ctx.createLinearGradient(0, floorY, 0, floorY + h * 0.1);
      refl.addColorStop(0, lightOn ? 'rgba(255, 190, 90, 0.10)' : 'rgba(140, 180, 200, 0.05)');
      refl.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = refl;
      ctx.fillRect(ix, floorY + h * 0.016, iw, h * 0.084);

      // nazwa nad kabiną
      ctx.fillStyle = TEXT;
      ctx.font = `bold ${h * 0.036}px system-ui, sans-serif`;
      ctx.fillText(cabin.label, cx, top - h * 0.07);
      if (cabin.sub) {
        ctx.fillStyle = '#8FA8B5';
        ctx.font = `italic ${h * 0.022}px system-ui, sans-serif`;
        ctx.fillText(cabin.sub, cx, top - h * 0.036);
      }

      // plakietka presetu somtaśmy pod kabiną
      if (isKonfesjonal && data?.wwwipownia.somtasmaPreset) {
        const label = `✨ ${data.wwwipownia.somtasmaPreset}`;
        ctx.font = `${h * 0.024}px ${MONO}`;
        const chipW = Math.min(ctx.measureText(label).width + h * 0.04, cw);
        const chipH = h * 0.044;
        const cy = floorY + h * 0.05;
        ctx.fillStyle = '#0D1B22';
        ctx.strokeStyle = data.wwwipownia.somtasma === 'on' ? `hsl(${(t / 5) % 360}, 90%, 60%)` : '#2A4654';
        ctx.lineWidth = 1.5;
        roundRect(ctx, cx - chipW / 2, cy - chipH / 2, chipW, chipH, chipH / 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = TEXT;
        ctx.fillText(label, cx, cy + h * 0.002, cw * 0.9);
      }
    }
  },
};
