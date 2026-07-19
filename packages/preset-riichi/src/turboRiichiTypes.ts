import type { DataSchema, WorldSource } from '@mahjongplus/world-language';

export type TurboRiichiSeat = 'east' | 'south' | 'west' | 'north';
export type TurboRiichiProofFace = 'm7' | 'p7' | 's7';

export interface TurboRiichiOptions {
  id?: string;
  declarerId?: TurboRiichiSeat;
  proofFace?: TurboRiichiProofFace;
  stake?: number;
  riichiHan?: number;
  maxWinsPerPlayer?: number | null;
  startingPoints?: number;
  wallTileCount?: number;
  /** Fixture interpreter output for one ron proposal; not production scoring. */
  ronPayment?: number;
  /** Fixture interpreter output paid by each opponent for one tsumo proposal. */
  tsumoPaymentEach?: number;
  minimumSettlementBalance?: number;
  settlementActorId?: string;
}

export interface TurboRiichiPolicy {
  id: string;
  declarerId: TurboRiichiSeat;
  proofFace: TurboRiichiProofFace;
  stake: number;
  riichiHan: number;
  maxWinsPerPlayer: number | null;
  startingPoints: number;
  wallTileCount: number;
  ronPayment: number;
  tsumoPaymentEach: number;
  minimumSettlementBalance: number;
  settlementActorId: string;
}

export interface TurboRiichiFixture {
  source: WorldSource;
  policy: TurboRiichiPolicy;
  declarationInputSchema: DataSchema;
  ids: {
    tripletIds: string[];
    initialDrawId: string;
    firstWallTileId: string;
  };
}

export const TURBO_PLAYERS: TurboRiichiSeat[] = ['east', 'south', 'west', 'north'];
export const TURBO_NEXT: Record<TurboRiichiSeat, TurboRiichiSeat> = {
  east: 'south',
  south: 'west',
  west: 'north',
  north: 'east',
};
