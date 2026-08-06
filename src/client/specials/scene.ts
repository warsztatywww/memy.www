// Wspólna scenografia trybów specjalnych: ciemny pokój nocą — kafelki metro,
// neonowy nagłówek, mokra podłoga, winieta. Używana przez showers i pantry.

export const BG = '#081217';
export const TILE = '#12242E';
export const GROUT = '#0A1820';
export const CHROME = '#9FB6C1';
export const RED = '#FF4D5E';
export const GREEN = '#3DD68C';
export const YELLOW = '#E6C229';
export const TEXT = '#EAF4F7';
export const MUTED = '#7A93A0';
export const MONO = `'DejaVu Sans Mono', ui-monospace, monospace`;

export function letterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  ctx.letterSpacing = `${px}px`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// tło: ściana z kafelków metro, podłoga z połyskiem, winieta
export function drawRoom(ctx: CanvasRenderingContext2D, w: number, h: number, floorY: number): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = TILE;
  ctx.fillRect(0, 0, w, floorY);

  const tw = w * 0.05;
  const th = h * 0.045;
  ctx.strokeStyle = GROUT;
  ctx.lineWidth = Math.max(1, h * 0.0022);
  ctx.beginPath();
  for (let row = 0, y = 0; y < floorY; row++, y += th) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    const offset = row % 2 === 0 ? 0 : tw / 2;
    for (let x = offset; x < w; x += tw) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, Math.min(y + th, floorY));
    }
  }
  ctx.stroke();

  // poświata za neonem nagłówka
  const glow = ctx.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h * 0.1, w * 0.35);
  glow.addColorStop(0, 'rgba(255, 190, 110, 0.07)');
  glow.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, floorY);

  const floor = ctx.createLinearGradient(0, floorY, 0, h);
  floor.addColorStop(0, '#0A1318');
  floor.addColorStop(1, '#04080B');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorY, w, h - floorY);
  ctx.fillStyle = 'rgba(200, 230, 240, 0.10)';
  ctx.fillRect(0, floorY, w, Math.max(1.5, h * 0.002));

  const vin = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.2, w / 2, h * 0.42, Math.max(w, h) * 0.72);
  vin.addColorStop(0, 'rgba(2, 6, 9, 0)');
  vin.addColorStop(1, 'rgba(2, 6, 9, 0.5)');
  ctx.fillStyle = vin;
  ctx.fillRect(0, 0, w, h);
}

export function drawNeonHeader(
  ctx: CanvasRenderingContext2D, t: number, w: number, h: number,
  title: string, subtitle: string,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  // neon: ciepła poświata z delikatnym drganiem
  ctx.shadowColor = 'rgba(255, 174, 69, 0.9)';
  ctx.shadowBlur = h * 0.035 * (0.92 + 0.08 * Math.sin(t / 90));
  ctx.fillStyle = '#FFE9BE';
  ctx.font = `bold ${h * 0.078}px system-ui, sans-serif`;
  ctx.fillText(title, w / 2, h * 0.082);
  ctx.restore();

  ctx.fillStyle = MUTED;
  ctx.font = `${h * 0.026}px ${MONO}`;
  letterSpacing(ctx, h * 0.012);
  ctx.fillText(subtitle, w / 2, h * 0.152);
  letterSpacing(ctx, 0);
}

// okrągła zawieszka „?" dla nieznanego stanu
export function drawUnknownTag(ctx: CanvasRenderingContext2D, h: number, cx: number, cy: number, r = h * 0.032): void {
  ctx.fillStyle = '#142833';
  ctx.strokeStyle = '#3A5666';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = `bold ${r * 1.1}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', cx, cy + r * 0.06);
}

// pastylka statusu z diodą; pilna pulsuje poświatą, a dioda przygasa w rytmie
export function drawPill(
  ctx: CanvasRenderingContext2D, t: number, h: number,
  cx: number, cy: number, pillW: number, pillH: number,
  color: string, dotColor: string, textColor: string, label: string, urgent: boolean,
): void {
  ctx.save();
  const pulse = urgent ? 0.55 + 0.45 * Math.sin(t / 260) : 0.3;
  ctx.shadowColor = color;
  ctx.shadowBlur = h * 0.025 * pulse;
  ctx.fillStyle = color;
  roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = dotColor;
  ctx.globalAlpha = !urgent || Math.sin(t / 260) > -0.3 ? 1 : 0.35;
  ctx.beginPath();
  ctx.arc(cx - pillW / 2 + pillH * 0.5, cy, h * 0.01, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = textColor;
  ctx.font = `bold ${pillH * 0.48}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  letterSpacing(ctx, h * 0.004);
  ctx.fillText(label, cx + pillH * 0.18, cy + h * 0.002);
  letterSpacing(ctx, 0);
}
