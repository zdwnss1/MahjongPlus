import type { EntityRef } from './entityGraph.js';

export interface TileAppearance {
  color?: string;
  material?: string;
  glyph?: string;
  labels?: string[];
}

export interface TilePrototypeDefinition {
  id: string;
  baseFace: string;
  engineFace: string;
  traits: string[];
  appearance: TileAppearance;
}

export interface SemanticTileInstance {
  id: string;
  prototypeId: string;
  physicalFace: string;
  effectiveFaces: string[];
  traits: string[];
  appearance: TileAppearance;
}

export type ScoreContributionPhase = 'qualification' | 'han' | 'fu' | 'limit' | 'settlement';

export interface TileScoreContribution {
  id: string;
  source: EntityRef<'tile' | 'tile-kind' | 'binding' | 'rule'>;
  phase: ScoreContributionPhase;
  amount: number;
  label: string;
  eventType: string;
  contextTags?: string[];
}

export function createTileInstance(
  id: string,
  prototype: TilePrototypeDefinition,
  overrides: Partial<Pick<SemanticTileInstance, 'effectiveFaces' | 'traits' | 'appearance'>> = {},
): SemanticTileInstance {
  return {
    id,
    prototypeId: prototype.id,
    physicalFace: prototype.baseFace,
    effectiveFaces: overrides.effectiveFaces ? [...overrides.effectiveFaces] : [prototype.baseFace],
    traits: [...new Set([...(prototype.traits ?? []), ...(overrides.traits ?? [])])],
    appearance: {
      ...prototype.appearance,
      ...overrides.appearance,
      labels: [...(overrides.appearance?.labels ?? prototype.appearance.labels ?? [])],
    },
  };
}

export function coloredPrototype(
  id: string,
  baseFace: string,
  color: string,
  traits: string[] = [],
  engineFace = baseFace,
): TilePrototypeDefinition {
  return {
    id,
    baseFace,
    engineFace,
    traits: [...new Set([color, ...traits])],
    appearance: { color },
  };
}

export function validateScoreContribution(contribution: TileScoreContribution): void {
  if (!Number.isFinite(contribution.amount)) throw new Error('Score contribution amount must be finite.');
  if (!contribution.label) throw new Error('Score contribution requires a label.');
}

export function totalContributions(
  contributions: readonly TileScoreContribution[],
  phase: ScoreContributionPhase,
  eventType: string,
  contextTags: readonly string[] = [],
): number {
  const tags = new Set(contextTags);
  return contributions
    .filter((entry) => entry.phase === phase && entry.eventType === eventType)
    .filter((entry) => (entry.contextTags ?? []).every((tag) => tags.has(tag)))
    .reduce((sum, entry) => {
      validateScoreContribution(entry);
      return sum + entry.amount;
    }, 0);
}
