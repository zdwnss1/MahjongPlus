export const SEATS = ['east', 'south', 'west', 'north'] as const;
export type Seat = (typeof SEATS)[number];
export type BaseProfileId = 'tenhou' | 'mleague';
export type MatchLength = 'east' | 'hanchan';
export type RoomPhase = 'lobby' | 'constitution' | 'governance' | 'playing' | 'finished';

export type IllegalActionPolicy = 'reject-only' | 'fixed-penalty';
export type PenaltyDistribution = 'burn' | 'split-opponents';

export interface PenaltyPolicy {
  readonly illegalActionPolicy: IllegalActionPolicy;
  readonly mistimedActionPenalty: number;
  readonly falseWinPenalty: number;
  readonly distribution: PenaltyDistribution;
  readonly repeatedViolationLimit: number;
}

export interface MatchConstitution {
  readonly baseProfile: BaseProfileId;
  readonly matchLength: MatchLength;
  readonly initialScore: number;
  readonly bankruptcy: boolean;
  readonly ruleSlotsPerPlayer: number;
  readonly actionTimeoutSeconds: number;
  readonly penaltyPolicy: PenaltyPolicy;
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

export interface TileInstanceView {
  id: string;
  face: string;
  physicalFace: string;
  traits: string[];
}

export type ActionKind =
  | 'draw'
  | 'discard'
  | 'riichi'
  | 'tsumo'
  | 'ron'
  | 'chi'
  | 'pon'
  | 'open-kan'
  | 'closed-kan'
  | 'added-kan'
  | 'abortive-draw'
  | 'reveal-hand'
  | 'pass'
  | 'custom';

export type ActionIntent =
  | { type: 'draw'; source?: 'wall' | 'dead-wall' }
  | { type: 'discard'; tileId: string }
  | { type: 'riichi'; tileId: string }
  | { type: 'win'; mode: 'tsumo' | 'ron'; sourceEventId?: string }
  | { type: 'call'; kind: 'chi' | 'pon' | 'open-kan'; meld?: string; sourceEventId?: string }
  | { type: 'kan'; kind: 'closed-kan' | 'added-kan'; meld?: string }
  | { type: 'abortive-draw'; declaration?: string }
  | { type: 'reveal-hand' }
  | { type: 'pass'; opportunityId?: string }
  | { type: 'custom'; actionType: string; parameters?: Record<string, unknown> };

export interface ActionCatalogEntry {
  kind: ActionKind;
  label: string;
  description: string;
  parameterMode: 'none' | 'tile' | 'meld' | 'custom';
}

export interface GameActionOption {
  id: string;
  label: string;
  kind: ActionKind;
  intent: ActionIntent;
}

export interface GameActionRequest {
  id: string;
  prompt: string;
  options: GameActionOption[];
  expiresAt: number;
}

export interface ActionAttempt {
  attemptId: string;
  observedRevision: number;
  action: ActionIntent;
}

export type ActionOutcome =
  | 'executed'
  | 'executed-with-penalty'
  | 'rejected'
  | 'rejected-with-penalty'
  | 'stale'
  | 'invalid';

export type ViolationCode =
  | 'action.stale'
  | 'action.duplicate'
  | 'action.invalid-reference'
  | 'action.missing-parameters'
  | 'action.not-current-opportunity'
  | 'action.out-of-turn'
  | 'win.false-declaration'
  | 'action.unsupported-by-base-engine'
  | 'action.rate-limit';

export interface PublicViolation {
  code: ViolationCode;
  message: string;
  blocking: boolean;
}

export interface PublicPenaltyEffect {
  type: 'score-delta' | 'warning' | 'disqualification';
  playerId: string;
  amount?: number;
  message: string;
}

export interface ActionReceipt {
  attemptId: string;
  actorId: string;
  action: ActionIntent;
  outcome: ActionOutcome;
  revisionBefore: number;
  revisionAfter: number;
  violations: PublicViolation[];
  penalties: PublicPenaltyEffect[];
  committedEventIds: string[];
  createdAt: string;
}

export interface PlayerBoardState {
  playerId: string;
  name: string;
  currentSeat: Seat;
  score: number;
  handCount: number;
  hand?: TileInstanceView[];
  melds: string[];
  river: TileInstanceView[];
  riichi: boolean;
  handRevealed: boolean;
  violationCount: number;
}

export interface GameSnapshot {
  revision: number;
  round: string;
  honba: number;
  riichiSticks: number;
  remainingTiles: number;
  doraIndicators: TileInstanceView[];
  players: PlayerBoardState[];
  actionRequest: GameActionRequest | null;
  actionCatalog: ActionCatalogEntry[];
  recentReceipts: ActionReceipt[];
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
