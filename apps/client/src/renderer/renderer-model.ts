export function interpolateAvatarPosition(startX: number, startY: number, targetX: number, targetY: number, progress: number): { readonly x: number; readonly y: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  return { x: startX + (targetX - startX) * clamped, y: startY + (targetY - startY) * clamped };
}

export function reconcileEntityIds(existing: readonly string[], incoming: readonly string[]): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const existingSet = new Set(existing);
  const incomingSet = new Set(incoming);
  return {
    added: incoming.filter((id) => !existingSet.has(id)),
    removed: existing.filter((id) => !incomingSet.has(id)),
  };
}
