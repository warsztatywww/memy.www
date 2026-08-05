export interface ClientSpecial {
  id: string;
  previewData?: unknown; // do trybu ?preview=<id>
  render(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, data: unknown, rng: () => number): void;
}
export const clientSpecials: ClientSpecial[] = []; // Task 11 dodaje pantry
