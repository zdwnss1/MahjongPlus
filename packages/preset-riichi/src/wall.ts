import { PresetRandom } from './random.js';

export const TURN_ORDER = ['east', 'south', 'west', 'north'] as const;
export const PHYSICAL_CLOCKWISE_ORDER = ['east', 'north', 'west', 'south'] as const;
export type RiichiSeat = (typeof TURN_ORDER)[number];

export interface WallPolicy {
  stackHeight: number;
  distribution: 'balanced-from-east' | 'balanced-from-dealer' | 'explicit';
  explicitStackCounts?: Partial<Record<RiichiSeat, number>>;
  partialStack: 'allow' | 'forbid';
  deadWallTileCount: number;
}

export interface WallStackDescription {
  id: string;
  side: RiichiSeat;
  indexFromRight: number;
  tileIdsTopToBottom: string[];
}

export interface WallOpeningDescription {
  diceValues: [number, number];
  diceTotal: number;
  selectedSide: RiichiSeat;
  countedStackId: string;
  liveStartStackId: string;
  stacks: WallStackDescription[];
  sideStackCounts: Record<RiichiSeat, number>;
  liveTileOrder: string[];
  deadWallTileOrder: string[];
}

export const STANDARD_WALL_POLICY: WallPolicy = {
  stackHeight: 2,
  distribution: 'balanced-from-east',
  partialStack: 'forbid',
  deadWallTileCount: 14,
};

function seatAfter(seat: RiichiSeat, offset: number, order: readonly RiichiSeat[]): RiichiSeat {
  return order[(order.indexOf(seat) + offset + order.length * 100) % order.length];
}

function distribute(stackCount: number, dealer: RiichiSeat, policy: WallPolicy): Record<RiichiSeat, number> {
  if (policy.distribution === 'explicit') {
    const counts = Object.fromEntries(TURN_ORDER.map((seat) => [seat, policy.explicitStackCounts?.[seat] ?? 0])) as Record<RiichiSeat, number>;
    if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== stackCount) {
      throw new Error('Explicit wall counts do not match the number of stacks.');
    }
    return counts;
  }
  const base = Math.floor(stackCount / 4);
  let remainder = stackCount % 4;
  const counts = Object.fromEntries(TURN_ORDER.map((seat) => [seat, base])) as Record<RiichiSeat, number>;
  const start = policy.distribution === 'balanced-from-dealer' ? dealer : 'east';
  for (let offset = 0; remainder > 0; offset += 1, remainder -= 1) counts[seatAfter(start, offset, TURN_ORDER)] += 1;
  return counts;
}

export function createWallOpening(
  shuffledTileIds: readonly string[],
  dealer: RiichiSeat,
  random: PresetRandom,
  policy: WallPolicy = STANDARD_WALL_POLICY,
): WallOpeningDescription {
  if (!Number.isInteger(policy.stackHeight) || policy.stackHeight < 1) throw new Error('Wall stack height must be positive.');
  if (policy.partialStack === 'forbid' && shuffledTileIds.length % policy.stackHeight !== 0) {
    throw new Error('Tile count does not fill complete wall stacks.');
  }
  if (policy.deadWallTileCount < 0 || policy.deadWallTileCount >= shuffledTileIds.length) throw new Error('Invalid dead wall size.');
  const stackCount = Math.ceil(shuffledTileIds.length / policy.stackHeight);
  const sideStackCounts = distribute(stackCount, dealer, policy);
  const stacks: WallStackDescription[] = [];
  let cursor = 0;
  for (const side of PHYSICAL_CLOCKWISE_ORDER) {
    for (let indexFromRight = 0; indexFromRight < sideStackCounts[side]; indexFromRight += 1) {
      const tileIdsTopToBottom = shuffledTileIds.slice(cursor, cursor + policy.stackHeight);
      cursor += tileIdsTopToBottom.length;
      stacks.push({ id: `wall-stack:${side}:${indexFromRight}`, side, indexFromRight, tileIdsTopToBottom });
    }
  }
  const diceValues: [number, number] = [random.int(6) + 1, random.int(6) + 1];
  const diceTotal = diceValues[0] + diceValues[1];
  const selectedSide = seatAfter(dealer, diceTotal - 1, TURN_ORDER);
  const firstIndex = stacks.findIndex((stack) => stack.side === selectedSide && stack.indexFromRight === 0);
  if (firstIndex < 0) throw new Error(`Selected wall ${selectedSide} has no stacks.`);
  const countedIndex = (firstIndex + diceTotal - 1) % stacks.length;
  const liveStartIndex = (countedIndex + 1) % stacks.length;
  const rotatedStacks = stacks.slice(liveStartIndex).concat(stacks.slice(0, liveStartIndex));
  const rotatedTiles = rotatedStacks.flatMap((stack) => stack.tileIdsTopToBottom);
  return {
    diceValues,
    diceTotal,
    selectedSide,
    countedStackId: stacks[countedIndex].id,
    liveStartStackId: stacks[liveStartIndex].id,
    stacks,
    sideStackCounts,
    liveTileOrder: rotatedTiles.slice(0, rotatedTiles.length - policy.deadWallTileCount),
    deadWallTileOrder: rotatedTiles.slice(rotatedTiles.length - policy.deadWallTileCount),
  };
}
