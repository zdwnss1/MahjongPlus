export const SEATS = ['east', 'south', 'west', 'north'] as const;
export type Seat = (typeof SEATS)[number];
export type BaseProfileId = 'tenhou' | 'mleague';
export type MatchLength = 'east' | 'hanchan';
export type RoomPhase = 'lobby' | 'constitution' | 'governance' | 'playing' | 'finished';

export interface MatchConstitution {
  readonly baseProfile: BaseProfileId;
  readonly matchLength: MatchLength;
  readonly initialScore: number;
  readonly bankruptcy: boolean;
  readonly ruleSlotsPerPlayer: number;
  readonly actionTimeoutSeconds: number;
}

export interface PlayerSummary {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  startingSeat?: Seat;
}

export type RuleVote = 'approve' | 'reject';
export type RuleArtifactStatus = 'compiled-noop' | 'technical-rejected';

export interface RuleArtifact {
  id: string;
  authorId: string;
  slot: number;
  originalText: string;
  canonicalText: string;
  status: RuleArtifactStatus;
  executable: boolean;
  compiler: string;
  createdAt: string;
}

export interface GovernanceState {
  proposerId: string | null;
  proposerSeat: Seat | null;
  slot: number;
  totalSlots: number;
  skippedAllPlayerIds: string[];
  proposal: null | {
    id: string;
    authorId: string;
    text: string;
    votes: Record<string, RuleVote | null>;
    stage: 'voting' | 'author-confirmation';
    candidate?: RuleArtifact;
    error?: string;
  };
}

export interface GameActionOption {
  id: string;
  label: string;
  kind: 'discard' | 'riichi' | 'tsumo' | 'ron' | 'chi' | 'pon' | 'kan' | 'abort' | 'pass';
}

export interface GameActionRequest {
  id: string;
  prompt: string;
  options: GameActionOption[];
  expiresAt: number;
}

export interface PlayerBoardState {
  playerId: string;
  name: string;
  currentSeat: Seat;
  score: number;
  handCount: number;
  hand?: string[];
  melds: string[];
  river: string[];
  riichi: boolean;
}

export interface GameSnapshot {
  round: string;
  honba: number;
  riichiSticks: number;
  remainingTiles: number;
  doraIndicators: string[];
  players: PlayerBoardState[];
  actionRequest: GameActionRequest | null;
  lastEvent: string;
  result?: {
    scores: Record<string, number>;
    ranks: string[];
  };
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: PlayerSummary[];
  constitution: MatchConstitution;
  constitutionConfirmedBy: string[];
  governance: GovernanceState | null;
  acceptedRules: RuleArtifact[];
  game: GameSnapshot | null;
  notice: string | null;
}

export interface SessionIdentity {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface Ack<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}
