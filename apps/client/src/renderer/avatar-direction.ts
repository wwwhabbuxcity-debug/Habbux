export function resolveAvatarDirection(dx: number, dy: number, previous = 0): number {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return normalizeDirection(previous);
  if (dx > 0 && dy < 0) return 0;
  if (dx > 0 && dy === 0) return 1;
  if (dx > 0 && dy > 0) return 2;
  if (dx === 0 && dy > 0) return 3;
  if (dx < 0 && dy > 0) return 4;
  if (dx < 0 && dy === 0) return 5;
  if (dx < 0 && dy < 0) return 6;
  return 7;
}

export function normalizeDirection(direction: number): number {
  return Number.isInteger(direction) && direction >= 0 && direction <= 7 ? direction : 0;
}

export function resolveMirroring(direction: number): { readonly renderDirection: number; readonly mirrored: boolean } {
  const normalized = normalizeDirection(direction);
  return {
    renderDirection: ({ 0: 0, 1: 1, 2: 2, 3: 3, 4: 2, 5: 1, 6: 0, 7: 7 } as Record<number, number>)[normalized] ?? 0,
    mirrored: normalized === 4 || normalized === 5 || normalized === 6,
  };
}
