export const CARDINAL_MOVEMENT_STEP_MS = 500;
export const DIAGONAL_MOVEMENT_STEP_MS = 707;

export function avatarMovementDurationMs(deltaX: number, deltaY: number): number {
  return deltaX !== 0 && deltaY !== 0 ? DIAGONAL_MOVEMENT_STEP_MS : CARDINAL_MOVEMENT_STEP_MS;
}

export function isAdjacentAvatarStep(deltaX: number, deltaY: number): boolean {
  return (deltaX !== 0 || deltaY !== 0) && Math.abs(deltaX) <= 1 && Math.abs(deltaY) <= 1;
}

export function interpolateAvatarPosition(startX: number, startY: number, targetX: number, targetY: number, progress: number): { readonly x: number; readonly y: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  return { x: startX + (targetX - startX) * clamped, y: startY + (targetY - startY) * clamped };
}

export function interpolateAvatarElevation(startZ: number, targetZ: number, progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return startZ + (targetZ - startZ) * clamped;
}

export function reconcileEntityIds(existing: readonly string[], incoming: readonly string[]): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const existingSet = new Set(existing);
  const incomingSet = new Set(incoming);
  return {
    added: incoming.filter((id) => !existingSet.has(id)),
    removed: existing.filter((id) => !incomingSet.has(id)),
  };
}
