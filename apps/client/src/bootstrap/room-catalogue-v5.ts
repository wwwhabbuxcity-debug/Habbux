export interface RoomCatalogueEntry {
  readonly roomId: string;
  readonly name: string;
}

/** Validates the bounded native catalogue once, before building player options. */
export function parseRoomCatalogueV5(text: string): readonly RoomCatalogueEntry[] {
  if (text.length > 16_384) throw new Error('Catalogue exceeds limit');
  const catalogue: unknown = JSON.parse(text);
  if (!Array.isArray(catalogue) || catalogue.length < 1 || catalogue.length > 64) throw new Error('Invalid catalogue');
  const seen = new Set<string>();
  return catalogue.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('roomId' in entry) || !('name' in entry)
        || typeof entry.roomId !== 'string' || !/^9000000000000000\d{3}$/.test(entry.roomId)
        || BigInt(entry.roomId) < 9_000_000_000_000_000_064n || BigInt(entry.roomId) > 9_000_000_000_000_000_127n
        || seen.has(entry.roomId) || typeof entry.name !== 'string' || entry.name.length < 1 || entry.name.length > 80) throw new Error('Invalid catalogue entry');
    seen.add(entry.roomId);
    return {roomId: entry.roomId, name: entry.name};
  });
}
