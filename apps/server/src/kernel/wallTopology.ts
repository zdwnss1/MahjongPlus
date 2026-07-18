export const TURN_ORDER = ['east', 'south', 'west', 'north'] as const;
export const PHYSICAL_CLOCKWISE_ORDER = ['east', 'north', 'west', 'south'] as const;
export type WallSeat = (typeof TURN_ORDER)[number];

export interface DiceRoll {
  id: string;
  roller: WallSeat;
  values: number[];
  total: number;
}

export interface WallStackRef {
  side: WallSeat;
  indexFromRight: number;
}

export interface WallStack extends WallStackRef {
  id: string;
  tilesTopToBottom: string[];
}

export interface WallSide {
  seat: WallSeat;
  stacksFromRight: WallStack[];
}

export interface WallBuildPolicy {
  stackHeight: number;
  distribution: 'balanced-from-dealer' | 'balanced-from-east' | 'explicit';
  explicitStackCounts?: Partial<Record<WallSeat, number>>;
  partialStack: 'allow' | 'forbid';
}

export interface WallTopology {
  tileCount: number;
  stackHeight: number;
  sides: Record<WallSeat, WallSide>;
  drawRing: WallStackRef[];
}

export interface WallOpening {
  dice: DiceRoll;
  nominalSelectedSide: WallSeat;
  countedStack: WallStackRef;
  liveStartStack: WallStackRef;
  liveTileOrder: string[];
  deadWallTileOrder: string[];
}

export const STANDARD_WALL_POLICY: WallBuildPolicy = {
  stackHeight: 2,
  distribution: 'balanced-from-east',
  partialStack: 'forbid',
};

function seatAfter(seat: WallSeat, offset: number, order: readonly WallSeat[]): WallSeat {
  return order[(order.indexOf(seat) + offset + order.length * 100) % order.length];
}

function stackKey(ref: WallStackRef): string {
  return `${ref.side}:${ref.indexFromRight}`;
}

function distributeStackCounts(
  stackCount: number,
  dealer: WallSeat,
  policy: WallBuildPolicy,
): Record<WallSeat, number> {
  if (policy.distribution === 'explicit') {
    const counts = Object.fromEntries(TURN_ORDER.map((seat) => [seat, policy.explicitStackCounts?.[seat] ?? 0])) as Record<WallSeat, number>;
    if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== stackCount) {
      throw new Error('Explicit wall side counts must equal total stack count.');
    }
    return counts;
  }

  const base = Math.floor(stackCount / 4);
  let remainder = stackCount % 4;
  const counts = Object.fromEntries(TURN_ORDER.map((seat) => [seat, base])) as Record<WallSeat, number>;
  const start = policy.distribution === 'balanced-from-dealer' ? dealer : 'east';
  for (let offset = 0; remainder > 0; offset += 1, remainder -= 1) {
    counts[seatAfter(start, offset, TURN_ORDER)] += 1;
  }
  return counts;
}

export function buildWallTopology(
  tileIds: readonly string[],
  dealer: WallSeat,
  policy: WallBuildPolicy = STANDARD_WALL_POLICY,
): WallTopology {
  if (!Number.isInteger(policy.stackHeight) || policy.stackHeight < 1) throw new Error('Stack height must be a positive integer.');
  if (policy.partialStack === 'forbid' && tileIds.length % policy.stackHeight !== 0) {
    throw new Error('Tile count does not fill complete wall stacks.');
  }
  const stackCount = Math.ceil(tileIds.length / policy.stackHeight);
  const counts = distributeStackCounts(stackCount, dealer, policy);
  const sides = {} as Record<WallSeat, WallSide>;
  let cursor = 0;

  for (const side of PHYSICAL_CLOCKWISE_ORDER) {
    const stacksFromRight: WallStack[] = [];
    for (let indexFromRight = 0; indexFromRight < counts[side]; indexFromRight += 1) {
      const tiles = tileIds.slice(cursor, cursor + policy.stackHeight);
      cursor += tiles.length;
      stacksFromRight.push({
        id: `wall-stack:${side}:${indexFromRight}`,
        side,
        indexFromRight,
        tilesTopToBottom: [...tiles],
      });
    }
    sides[side] = { seat: side, stacksFromRight };
  }

  const drawRing = PHYSICAL_CLOCKWISE_ORDER.flatMap((side) =>
    sides[side].stacksFromRight.map(({ side: stackSide, indexFromRight }) => ({ side: stackSide, indexFromRight })),
  );
  return { tileCount: tileIds.length, stackHeight: policy.stackHeight, sides, drawRing };
}

export function createDiceRoll(id: string, roller: WallSeat, values: readonly number[], faces = 6): DiceRoll {
  if (values.length < 1) throw new Error('At least one die is required.');
  if (values.some((value) => !Number.isInteger(value) || value < 1 || value > faces)) throw new Error('Invalid die value.');
  return { id, roller, values: [...values], total: values.reduce((sum, value) => sum + value, 0) };
}

export function resolveWallOpening(
  topology: WallTopology,
  dealer: WallSeat,
  dice: DiceRoll,
  deadWallTileCount: number,
): WallOpening {
  if (topology.drawRing.length === 0) throw new Error('Cannot open an empty wall.');
  if (!Number.isInteger(deadWallTileCount) || deadWallTileCount < 0 || deadWallTileCount >= topology.tileCount) {
    throw new Error('Invalid dead wall tile count.');
  }

  const nominalSelectedSide = seatAfter(dealer, dice.total - 1, TURN_ORDER);
  const firstRingIndex = topology.drawRing.findIndex((ref) => ref.side === nominalSelectedSide && ref.indexFromRight === 0);
  if (firstRingIndex < 0) throw new Error(`Selected wall side ${nominalSelectedSide} has no stacks.`);

  // Count from the selected wall's right edge. With non-standard short sides,
  // counting continues around the physical wall ring instead of changing the rule.
  const countedRingIndex = (firstRingIndex + dice.total - 1) % topology.drawRing.length;
  const liveStartRingIndex = (countedRingIndex + 1) % topology.drawRing.length;
  const countedStack = topology.drawRing[countedRingIndex];
  const liveStartStack = topology.drawRing[liveStartRingIndex];

  const stackByKey = new Map<string, WallStack>();
  for (const side of TURN_ORDER) {
    for (const stack of topology.sides[side].stacksFromRight) stackByKey.set(stackKey(stack), stack);
  }
  const ringTiles = topology.drawRing.flatMap((ref) => stackByKey.get(stackKey(ref))?.tilesTopToBottom ?? []);
  const liveStartTileIndex = topology.drawRing
    .slice(0, liveStartRingIndex)
    .reduce((sum, ref) => sum + (stackByKey.get(stackKey(ref))?.tilesTopToBottom.length ?? 0), 0);
  const rotated = ringTiles.slice(liveStartTileIndex).concat(ringTiles.slice(0, liveStartTileIndex));
  const deadWallTileOrder = rotated.slice(rotated.length - deadWallTileCount);
  const liveTileOrder = rotated.slice(0, rotated.length - deadWallTileCount);

  return {
    dice,
    nominalSelectedSide,
    countedStack: { ...countedStack },
    liveStartStack: { ...liveStartStack },
    liveTileOrder,
    deadWallTileOrder,
  };
}
