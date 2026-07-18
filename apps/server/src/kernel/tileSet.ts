export interface TileKindDefinition {
  face: string;
  copies: number;
  traits?: string[];
}

export interface TileSetDefinition {
  id: string;
  version: string;
  kinds: TileKindDefinition[];
  deadWallSize: number;
  maximumDoraIndicators: number;
}

export interface StandardTileSetOptions {
  copiesPerTile?: number;
  redFives?: Partial<Record<'m' | 'p' | 's', number>>;
  extraCopies?: Record<string, number>;
  deadWallSize?: number;
  maximumDoraIndicators?: number;
}

export function createStandardTileSet(options: StandardTileSetOptions = {}): TileSetDefinition {
  const copiesPerTile = options.copiesPerTile ?? 4;
  const redFives = { m: 1, p: 1, s: 1, ...options.redFives };
  const kinds: TileKindDefinition[] = [];

  for (const suit of ['m', 'p', 's', 'z'] as const) {
    const max = suit === 'z' ? 7 : 9;
    for (let rank = 1; rank <= max; rank += 1) {
      const face = `${suit}${rank}`;
      const total = copiesPerTile + (options.extraCopies?.[face] ?? 0);
      if (rank === 5 && suit !== 'z') {
        const red = Math.min(redFives[suit], total);
        if (red > 0) kinds.push({ face: `${suit}0`, copies: red, traits: ['red', 'five'] });
        if (total - red > 0) kinds.push({ face, copies: total - red, traits: ['five'] });
      } else {
        kinds.push({ face, copies: total, traits: suit === 'z' ? ['honor'] : [] });
      }
    }
  }

  return {
    id: 'riichi-standard',
    version: '1',
    kinds,
    deadWallSize: options.deadWallSize ?? 14,
    maximumDoraIndicators: options.maximumDoraIndicators ?? 5,
  };
}

export function validateTileSet(definition: TileSetDefinition): void {
  if (!definition.id) throw new Error('Tile set id is required.');
  if (!Number.isInteger(definition.deadWallSize) || definition.deadWallSize < 0) throw new Error('Invalid dead wall size.');
  if (!Number.isInteger(definition.maximumDoraIndicators) || definition.maximumDoraIndicators < 1) {
    throw new Error('Invalid maximum dora indicator count.');
  }
  const seen = new Set<string>();
  for (const kind of definition.kinds) {
    if (!/^[mpsz][0-9]$/.test(kind.face)) throw new Error(`Invalid tile face: ${kind.face}`);
    if (seen.has(kind.face)) throw new Error(`Duplicate tile kind: ${kind.face}`);
    if (!Number.isInteger(kind.copies) || kind.copies < 0) throw new Error(`Invalid copy count for ${kind.face}`);
    seen.add(kind.face);
  }
  const total = definition.kinds.reduce((sum, kind) => sum + kind.copies, 0);
  if (total <= definition.deadWallSize + 52) throw new Error('Tile set is too small for a four-player hand.');
}

export function expandTileSet(definition: TileSetDefinition): string[] {
  validateTileSet(definition);
  return definition.kinds.flatMap((kind) => Array.from({ length: kind.copies }, () => kind.face));
}

export interface TileSetPatch {
  addCopies?: Record<string, number>;
  setCopies?: Record<string, number>;
  addTraits?: Record<string, string[]>;
}

export function applyTileSetPatches(base: TileSetDefinition, patches: TileSetPatch[]): TileSetDefinition {
  const kinds = new Map(base.kinds.map((kind) => [kind.face, { ...kind, traits: [...(kind.traits ?? [])] }]));
  for (const patch of patches) {
    for (const [face, copies] of Object.entries(patch.setCopies ?? {})) {
      const current = kinds.get(face) ?? { face, copies: 0, traits: [] };
      current.copies = copies;
      kinds.set(face, current);
    }
    for (const [face, copies] of Object.entries(patch.addCopies ?? {})) {
      const current = kinds.get(face) ?? { face, copies: 0, traits: [] };
      current.copies += copies;
      kinds.set(face, current);
    }
    for (const [face, traits] of Object.entries(patch.addTraits ?? {})) {
      const current = kinds.get(face) ?? { face, copies: 0, traits: [] };
      current.traits = [...new Set([...(current.traits ?? []), ...traits])];
      kinds.set(face, current);
    }
  }
  const result = { ...base, kinds: [...kinds.values()] };
  validateTileSet(result);
  return result;
}
