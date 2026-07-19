import {
  evaluateFormula,
  expandPartitionMacro,
  solvePartitionExpansion,
  type CoreExpression,
  type CoreFormula,
  type PartitionGroupAlternative,
  type PartitionMacroInput,
} from '@mahjongplus/world-calculus';
import { stableHash } from './canonical.js';
import type { DataSchema } from './dataSchema.js';
import type { RuleModuleDefinition } from './ruleModules.js';

export interface PartitionInterpretationGroupPattern {
  id: string;
  size: number;
  predicate: CoreFormula;
}

export interface PartitionInterpretationStructureSlot {
  id: string;
  count: number;
  alternatives: string[];
}

export interface PartitionInterpretationStructure {
  id: string;
  slots: PartitionInterpretationStructureSlot[];
  /** Optional whole-proposal predicate. Variables: items, groups, source. */
  predicate?: CoreFormula;
}

export interface PartitionInterpretationProfile {
  id: string;
  title?: string;
  groupPatterns: PartitionInterpretationGroupPattern[];
  structures: PartitionInterpretationStructure[];
  memberVariable?: string;
  maxProposals?: number;
  candidateLimit?: number;
  maxSteps?: number;
}

export interface PartitionInterpretationRegistryDefinition {
  id: string;
  version: string;
  title?: string;
  profiles: PartitionInterpretationProfile[];
  actionId?: string;
  trackId?: string;
  eventType?: string;
  allowedWindowDefinitionIds?: string[];
}

export interface PartitionInterpretationItem {
  id: string;
  attributes: Record<string, unknown>;
}

export interface PartitionInterpretationSource {
  mode: 'response';
  windowId: string;
  exposureId: string;
  sourceEntityId: string;
  sourceActorId: string;
}

export interface PartitionInterpretationGroupProposal {
  slotId: string;
  patternId: string;
  itemIds: string[];
}

export interface PartitionInterpretationProposal {
  proposalId: string;
  profileId: string;
  structureId: string;
  exposureId: string;
  sourceEntityId: string;
  sourceActorId: string;
  groups: PartitionInterpretationGroupProposal[];
}

export interface EnumeratedPartitionInterpretation {
  proposal: PartitionInterpretationProposal;
  source: PartitionInterpretationSource;
}

const literal = (value: unknown): CoreExpression => ({ kind: 'literal', value });
const variable = (name: string): CoreExpression => ({ kind: 'variable', name });
const path = (target: CoreExpression, ...parts: string[]): CoreExpression => ({ kind: 'path', target, path: parts });
const list = (...items: CoreExpression[]): CoreExpression => ({ kind: 'list', items });
const record = (fields: Record<string, CoreExpression>): CoreExpression => ({ kind: 'record', fields });
const filter = (source: CoreExpression, as: string, where: CoreFormula): CoreExpression => ({ kind: 'filter', source, as, where });
const map = (source: CoreExpression, as: string, select: CoreExpression): CoreExpression => ({ kind: 'map', source, as, select });
const concat = (...sources: CoreExpression[]): CoreExpression => ({ kind: 'concat', sources });
const flatten = (source: CoreExpression): CoreExpression => ({ kind: 'flatten', source });
const distinct = (source: CoreExpression): CoreExpression => ({ kind: 'distinct', source });
const aggregate = (operator: 'count' | 'sum' | 'min' | 'max', source: CoreExpression): CoreExpression => ({ kind: 'aggregate', operator, source });
const compare = (
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
  left: CoreExpression,
  right: CoreExpression,
): CoreFormula => ({ kind: 'compare', operator, left, right });
const all = (...values: CoreFormula[]): CoreFormula => ({ kind: 'all', values });
const any = (...values: CoreFormula[]): CoreFormula => ({ kind: 'any', values });
const contains = (collection: CoreExpression, value: CoreExpression): CoreFormula => ({ kind: 'contains', collection, value });
const quantify = (
  quantifier: 'exists' | 'forall',
  source: CoreExpression,
  as: string,
  where: CoreFormula,
): CoreFormula => ({ kind: 'quantify', quantifier, source, as, where });

function substituteExpression(
  expression: CoreExpression,
  replacements: Record<string, CoreExpression>,
  shadowed = new Set<string>(),
): CoreExpression {
  if (expression.kind === 'literal') return structuredClone(expression);
  if (expression.kind === 'variable') {
    if (!shadowed.has(expression.name) && replacements[expression.name]) return structuredClone(replacements[expression.name]);
    return structuredClone(expression);
  }
  if (expression.kind === 'path') {
    return { ...expression, target: substituteExpression(expression.target, replacements, shadowed) };
  }
  if (expression.kind === 'list') {
    return { ...expression, items: expression.items.map((entry) => substituteExpression(entry, replacements, shadowed)) };
  }
  if (expression.kind === 'record') {
    return {
      ...expression,
      fields: Object.fromEntries(Object.entries(expression.fields)
        .map(([key, value]) => [key, substituteExpression(value, replacements, shadowed)])),
    };
  }
  if (expression.kind === 'if') {
    return {
      ...expression,
      condition: substituteFormula(expression.condition, replacements, shadowed),
      then: substituteExpression(expression.then, replacements, shadowed),
      else: substituteExpression(expression.else, replacements, shadowed),
    };
  }
  if (expression.kind === 'arithmetic') {
    return {
      ...expression,
      left: substituteExpression(expression.left, replacements, shadowed),
      right: substituteExpression(expression.right, replacements, shadowed),
    };
  }
  if (expression.kind === 'filter') {
    const nested = new Set(shadowed).add(expression.as);
    return {
      ...expression,
      source: substituteExpression(expression.source, replacements, shadowed),
      where: substituteFormula(expression.where, replacements, nested),
    };
  }
  if (expression.kind === 'map') {
    const nested = new Set(shadowed).add(expression.as);
    return {
      ...expression,
      source: substituteExpression(expression.source, replacements, shadowed),
      select: substituteExpression(expression.select, replacements, nested),
    };
  }
  if (expression.kind === 'concat') {
    return { ...expression, sources: expression.sources.map((entry) => substituteExpression(entry, replacements, shadowed)) };
  }
  if (expression.kind === 'flatten' || expression.kind === 'distinct') {
    return { ...expression, source: substituteExpression(expression.source, replacements, shadowed) };
  }
  return {
    ...expression,
    source: substituteExpression(expression.source, replacements, shadowed),
    value: expression.value ? substituteExpression(expression.value, replacements, shadowed) : undefined,
  };
}

function substituteFormula(
  formula: CoreFormula,
  replacements: Record<string, CoreExpression>,
  shadowed = new Set<string>(),
): CoreFormula {
  if (formula.kind === 'boolean') return structuredClone(formula);
  if (formula.kind === 'not') return { ...formula, value: substituteFormula(formula.value, replacements, shadowed) };
  if (formula.kind === 'all' || formula.kind === 'any') {
    return { ...formula, values: formula.values.map((entry) => substituteFormula(entry, replacements, shadowed)) };
  }
  if (formula.kind === 'compare') {
    return {
      ...formula,
      left: substituteExpression(formula.left, replacements, shadowed),
      right: substituteExpression(formula.right, replacements, shadowed),
    };
  }
  if (formula.kind === 'contains') {
    return {
      ...formula,
      collection: substituteExpression(formula.collection, replacements, shadowed),
      value: substituteExpression(formula.value, replacements, shadowed),
    };
  }
  const nested = new Set(shadowed).add(formula.as);
  return {
    ...formula,
    source: substituteExpression(formula.source, replacements, shadowed),
    where: substituteFormula(formula.where, replacements, nested),
  };
}

function assertProfile(profile: PartitionInterpretationProfile): void {
  if (!profile.id) throw new Error('Partition interpretation profile id is required.');
  const patterns = new Map<string, PartitionInterpretationGroupPattern>();
  for (const pattern of profile.groupPatterns) {
    if (!pattern.id) throw new Error(`Profile ${profile.id} has an unnamed group pattern.`);
    if (patterns.has(pattern.id)) throw new Error(`Profile ${profile.id} repeats group pattern ${pattern.id}.`);
    if (!Number.isInteger(pattern.size) || pattern.size < 1) throw new Error(`Group pattern ${pattern.id} has invalid size.`);
    patterns.set(pattern.id, pattern);
  }
  if (profile.structures.length === 0) throw new Error(`Profile ${profile.id} requires at least one structure.`);
  const structureIds = new Set<string>();
  for (const structure of profile.structures) {
    if (!structure.id || structureIds.has(structure.id)) throw new Error(`Profile ${profile.id} has duplicate structure ${structure.id}.`);
    structureIds.add(structure.id);
    if (structure.slots.length === 0) throw new Error(`Structure ${structure.id} requires slots.`);
    const slotIds = new Set<string>();
    for (const slot of structure.slots) {
      if (!slot.id || slotIds.has(slot.id)) throw new Error(`Structure ${structure.id} repeats slot ${slot.id}.`);
      if (!Number.isInteger(slot.count) || slot.count < 1) throw new Error(`Structure slot ${slot.id} has invalid count.`);
      if (slot.alternatives.length === 0) throw new Error(`Structure slot ${slot.id} requires alternatives.`);
      for (const alternative of slot.alternatives) {
        if (!patterns.has(alternative)) throw new Error(`Structure ${structure.id} references unknown pattern ${alternative}.`);
      }
      slotIds.add(slot.id);
    }
  }
}

function structureGroupBounds(profile: PartitionInterpretationProfile): { min: number; max: number } {
  const counts = profile.structures.map((structure) => structure.slots.reduce((sum, slot) => sum + slot.count, 0));
  return { min: Math.min(...counts), max: Math.max(...counts) };
}

function proposalSchema(profile: PartitionInterpretationProfile): DataSchema {
  const patternIds = profile.groupPatterns.map((entry) => entry.id);
  const bounds = structureGroupBounds(profile);
  return {
    type: 'object',
    properties: {
      proposalId: { type: 'string', minLength: 1 },
      profileId: { const: profile.id },
      structureId: { type: 'string', enum: profile.structures.map((entry) => entry.id) },
      exposureId: { type: 'string', minLength: 1 },
      sourceEntityId: { type: 'string', minLength: 1 },
      sourceActorId: { type: 'string', minLength: 1 },
      groups: {
        type: 'array',
        minItems: bounds.min,
        maxItems: bounds.max,
        items: {
          type: 'object',
          properties: {
            slotId: { type: 'string', minLength: 1 },
            patternId: { type: 'string', enum: patternIds },
            itemIds: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
              uniqueItems: true,
            },
          },
          required: ['slotId', 'patternId', 'itemIds'],
          additionalProperties: false,
        },
      },
    },
    required: [
      'proposalId', 'profileId', 'structureId', 'exposureId',
      'sourceEntityId', 'sourceActorId', 'groups',
    ],
    additionalProperties: false,
  };
}

function registryInputSchema(registry: PartitionInterpretationRegistryDefinition): DataSchema {
  return {
    type: 'object',
    properties: {
      windowId: { type: 'string', minLength: 1 },
      proposal: { oneOf: registry.profiles.map(proposalSchema) },
    },
    required: ['windowId', 'proposal'],
    additionalProperties: false,
  };
}

function wrapItems(entities: CoreExpression): CoreExpression {
  return map(entities, 'wrappedEntity', record({
    id: path(variable('wrappedEntity'), 'id'),
    attributes: variable('wrappedEntity'),
  }));
}

function groupMembers(group: CoreExpression, authoritativeEntities: CoreExpression): CoreExpression {
  const ids = path(group, 'itemIds');
  return wrapItems(filter(
    authoritativeEntities,
    'memberEntity',
    contains(ids, path(variable('memberEntity'), 'id')),
  ));
}

function profileConstraint(
  profile: PartitionInterpretationProfile,
  proposal: CoreExpression,
  authoritativeItems: CoreExpression,
  authoritativeEntities: CoreExpression,
  source: CoreExpression,
): CoreFormula {
  const groups = path(proposal, 'groups');
  const proposalItemIds = flatten(map(groups, 'proposalGroup', path(variable('proposalGroup'), 'itemIds')));
  const distinctProposalItemIds = distinct(proposalItemIds);
  const authoritativeIds = map(authoritativeItems, 'authoritativeItem', path(variable('authoritativeItem'), 'id'));
  const patternMap = new Map(profile.groupPatterns.map((entry) => [entry.id, entry]));

  const structures = profile.structures.map((structure): CoreFormula => {
    const expectedSlots = structure.slots.flatMap((slot) => Array.from(
      { length: slot.count },
      (_, ordinal) => `${slot.id}:${ordinal}`,
    ));
    const slotChecks = structure.slots.flatMap((slot) => Array.from({ length: slot.count }, (_, ordinal): CoreFormula => {
      const slotId = `${slot.id}:${ordinal}`;
      const matching = filter(groups, 'candidateGroup', compare(
        'eq',
        path(variable('candidateGroup'), 'slotId'),
        literal(slotId),
      ));
      const selected = path(matching, '0');
      const members = groupMembers(selected, authoritativeEntities);
      const alternatives = slot.alternatives.map((patternId): CoreFormula => {
        const pattern = patternMap.get(patternId) as PartitionInterpretationGroupPattern;
        return all(
          compare('eq', path(selected, 'patternId'), literal(pattern.id)),
          compare('eq', aggregate('count', path(selected, 'itemIds')), literal(pattern.size)),
          compare('eq', aggregate('count', distinct(path(selected, 'itemIds'))), literal(pattern.size)),
          compare('eq', aggregate('count', members), literal(pattern.size)),
          substituteFormula(pattern.predicate, {
            [profile.memberVariable ?? 'members']: members,
            source,
          }),
        );
      });
      return all(
        compare('eq', aggregate('count', matching), literal(1)),
        any(...alternatives),
      );
    }));
    const enrichedGroups = map(groups, 'enrichedGroup', record({
      slotId: path(variable('enrichedGroup'), 'slotId'),
      patternId: path(variable('enrichedGroup'), 'patternId'),
      itemIds: path(variable('enrichedGroup'), 'itemIds'),
      members: groupMembers(variable('enrichedGroup'), authoritativeEntities),
    }));
    const whole = structure.predicate
      ? substituteFormula(structure.predicate, { items: authoritativeItems, groups: enrichedGroups, source })
      : { kind: 'boolean', value: true } as const;
    return all(
      compare('eq', path(proposal, 'structureId'), literal(structure.id)),
      compare('eq', aggregate('count', groups), literal(expectedSlots.length)),
      compare('eq', map(groups, 'orderedGroup', path(variable('orderedGroup'), 'slotId')), literal(expectedSlots)),
      quantify('forall', groups, 'knownGroup', contains(
        literal(expectedSlots),
        path(variable('knownGroup'), 'slotId'),
      )),
      ...slotChecks,
      whole,
    );
  });

  return all(
    compare('eq', path(proposal, 'profileId'), literal(profile.id)),
    compare('eq', aggregate('count', proposalItemIds), aggregate('count', distinctProposalItemIds)),
    compare('eq', aggregate('count', distinctProposalItemIds), aggregate('count', authoritativeIds)),
    quantify('forall', distinctProposalItemIds, 'proposalItemId', contains(authoritativeIds, variable('proposalItemId'))),
    quantify('forall', authoritativeIds, 'authoritativeItemId', contains(distinctProposalItemIds, variable('authoritativeItemId'))),
    any(...structures),
  );
}

export function compileResponsePartitionInterpretationModule(
  registry: PartitionInterpretationRegistryDefinition,
): RuleModuleDefinition {
  if (!registry.id || !registry.version) throw new Error('Interpretation registry id and version are required.');
  if (registry.profiles.length === 0) throw new Error('Interpretation registry requires profiles.');
  registry.profiles.forEach(assertProfile);
  const profileIds = registry.profiles.map((entry) => entry.id);
  if (new Set(profileIds).size !== profileIds.length) throw new Error('Interpretation registry profile ids must be unique.');

  const actionId = registry.actionId ?? `${registry.id}.submit-response`;
  const trackId = registry.trackId ?? `track:interpretations:${registry.id}`;
  const eventType = registry.eventType ?? 'interpretation.accepted';
  const constraintId = `${registry.id}.validate-response-proposal`;
  const rewriteId = `${registry.id}.commit-response-proposal`;
  const params = variable('params');
  const proposal = path(params, 'proposal');
  const world = variable('world');
  const entities = path(world, 'entities');
  const zones = path(world, 'zones');
  const windows = filter(entities, 'windowEntity', all(
    compare('eq', path(variable('windowEntity'), 'id'), path(params, 'windowId')),
    compare('eq', path(variable('windowEntity'), 'kind'), literal('response-window')),
  ));
  const window = path(windows, '0', 'components', 'responseWindow');
  const subjectPairs = literal({ $module: 'ref', path: 'bindings.subjectZones' });
  const subjectPair = path(filter(subjectPairs, 'subjectZone', compare(
    'eq',
    path(variable('subjectZone'), 'subjectId'),
    variable('actorId'),
  )), '0');
  const handZone = path(filter(zones, 'candidateZone', compare(
    'eq',
    path(variable('candidateZone'), 'id'),
    path(subjectPair, 'zoneId'),
  )), '0');
  const handIds = map(path(handZone, 'entries'), 'handEntry', path(variable('handEntry'), 'entityId'));
  const authoritativeIds = distinct(concat(handIds, list(path(window, 'sourceEntityId'))));
  const authoritativeEntities = filter(entities, 'authoritativeEntity', contains(
    authoritativeIds,
    path(variable('authoritativeEntity'), 'id'),
  ));
  const authoritativeItems = wrapItems(authoritativeEntities);
  const source = record({
    mode: literal('response'),
    windowId: path(params, 'windowId'),
    exposureId: path(window, 'sourceEventId'),
    sourceEntityId: path(window, 'sourceEntityId'),
    sourceActorId: path(window, 'sourceActorId'),
  });
  const trackIndex = { $module: 'entity-index', id: trackId } as unknown as string;
  const trackRecords = path(entities, trackIndex, 'components', 'interpretations', 'records');
  const canonical = record({
    profileId: path(proposal, 'profileId'),
    structureId: path(proposal, 'structureId'),
    exposureId: path(proposal, 'exposureId'),
    sourceEntityId: path(proposal, 'sourceEntityId'),
    sourceActorId: path(proposal, 'sourceActorId'),
    groups: path(proposal, 'groups'),
  });
  const duplicates = filter(trackRecords, 'acceptedInterpretation', compare(
    'eq',
    path(variable('acceptedInterpretation'), 'canonical'),
    canonical,
  ));
  const allowedDefinitions = registry.allowedWindowDefinitionIds ?? [];
  const definitionAllowed: CoreFormula = allowedDefinitions.length === 0
    ? { kind: 'boolean', value: true }
    : contains(literal(allowedDefinitions), path(window, 'definitionId'));
  const profileChecks = registry.profiles.map((profile) => profileConstraint(
    profile,
    proposal,
    authoritativeItems,
    authoritativeEntities,
    source,
  ));
  const constraint = {
    id: constraintId,
    variables: [],
    constraints: [all(
      compare('eq', aggregate('count', windows), literal(1)),
      compare('eq', path(window, 'state'), literal('open')),
      contains(path(window, 'participants'), variable('actorId')),
      definitionAllowed,
      compare('eq', aggregate('count', filter(
        literal({ $module: 'ref', path: 'bindings.subjectZones' }),
        'actorZone',
        compare('eq', path(variable('actorZone'), 'subjectId'), variable('actorId')),
      )), literal(1)),
      compare('eq', aggregate('count', authoritativeEntities), aggregate('count', authoritativeIds)),
      compare('eq', path(proposal, 'exposureId'), path(window, 'sourceEventId')),
      compare('eq', path(proposal, 'sourceEntityId'), path(window, 'sourceEntityId')),
      compare('eq', path(proposal, 'sourceActorId'), path(window, 'sourceActorId')),
      compare('eq', aggregate('count', duplicates), literal(0)),
      any(...profileChecks),
    )],
    maxSolutions: 1,
    maxSteps: 250_000,
  };
  const acceptedRecord = record({
    id: variable('actionEntityId'),
    actorId: variable('actorId'),
    proposalId: path(proposal, 'proposalId'),
    profileId: path(proposal, 'profileId'),
    structureId: path(proposal, 'structureId'),
    source,
    groups: path(proposal, 'groups'),
    items: authoritativeItems,
    canonical,
    state: literal('accepted'),
  });
  const evidenceRelation = record({
    id: variable('actionEntityId'),
    type: literal({ $module: 'ref', path: 'bindings.evidenceRelationType' }),
    source: record({ kind: literal('player'), id: variable('actorId') }),
    target: record({ kind: literal('tile'), id: path(window, 'sourceEntityId') }),
    metadata: record({
      interpretationActionId: variable('actionEntityId'),
      profileId: path(proposal, 'profileId'),
      structureId: path(proposal, 'structureId'),
      exposureId: path(window, 'sourceEventId'),
    }),
  });
  const rewrite = {
    id: rewriteId,
    operations: [
      {
        kind: 'set',
        path: ['world', 'entities', trackIndex, 'components', 'interpretations', 'records'],
        value: concat(trackRecords, list(acceptedRecord)),
      },
      {
        kind: 'set',
        path: ['world', 'relations'],
        value: concat(path(world, 'relations'), list(evidenceRelation)),
      },
    ],
  };

  return {
    id: registry.id,
    version: registry.version,
    title: registry.title,
    description: 'Authoritatively validates finite partition interpretation proposals against physical world state.',
    requiredBindings: ['subjectZones', 'evidenceRelationType'],
    additions: {
      entities: [{
        id: trackId,
        kind: 'fact-track',
        components: { interpretations: { records: [] } },
      }],
      actions: [{
        id: actionId,
        parameters: { windowId: 'string', proposal: 'object' },
        inputSchema: registryInputSchema(registry),
        requirements: [
          { id: `${actionId}.window`, kind: 'parameter-present', parameter: 'windowId', message: 'A response window id is required.' },
          { id: `${actionId}.proposal`, kind: 'parameter-present', parameter: 'proposal', message: 'An interpretation proposal is required.' },
          { id: `${actionId}.valid`, kind: 'core.constraint', programId: constraintId, message: 'The proposal does not match the authoritative physical items and interpretation profile.' },
        ],
        effects: [
          { kind: 'core.rewrite', programId: rewriteId },
          {
            kind: 'event.emit',
            eventType,
            subjects: [{ kind: 'actor' }],
            objects: [{ kind: 'entity', entityKind: 'tile', id: { kind: 'context', path: 'params.proposal.sourceEntityId' } }],
            payload: {
              proposalId: { kind: 'context', path: 'params.proposal.proposalId' },
              profileId: { kind: 'context', path: 'params.proposal.profileId' },
              structureId: { kind: 'context', path: 'params.proposal.structureId' },
            },
          },
        ],
      }],
      corePrograms: { constraints: [constraint], reducers: [], rewrites: [rewrite] },
      metadata: {
        interpretationRegistry: {
          id: registry.id,
          profiles: registry.profiles.map((profile) => ({
            id: profile.id,
            structures: profile.structures.map((structure) => structure.id),
          })),
        },
      },
    },
    artifacts: {
      actionId,
      trackId,
      profiles: registry.profiles,
      inputSchema: registryInputSchema(registry),
    },
    metadata: {
      service: 'finite-partition-interpretation',
      authoritativeProposalValidation: true,
      candidateEnumerationIsNonAuthoritative: true,
    },
  } as RuleModuleDefinition;
}

function slotInstances(structure: PartitionInterpretationStructure): Array<{
  id: string;
  alternatives: string[];
}> {
  return structure.slots.flatMap((slot) => Array.from(
    { length: slot.count },
    (_, ordinal) => ({ id: `${slot.id}:${ordinal}`, alternatives: slot.alternatives }),
  ));
}

function candidateGroups(
  profile: PartitionInterpretationProfile,
  structure: PartitionInterpretationStructure,
  items: PartitionInterpretationItem[],
  assignment: Record<string, unknown>,
): Array<PartitionInterpretationGroupProposal & { members: Array<{ id: string; attributes: Record<string, unknown>; assigned: string }> }> | undefined {
  const patterns = new Map(profile.groupPatterns.map((entry) => [entry.id, entry]));
  const groups = [];
  for (const slot of slotInstances(structure)) {
    const members = items
      .filter((item) => assignment[item.id] === slot.id)
      .map((item) => ({ id: item.id, attributes: structuredClone(item.attributes), assigned: slot.id }));
    const pattern = slot.alternatives
      .map((id) => patterns.get(id))
      .find((entry) => entry && entry.size === members.length && evaluateFormula(entry.predicate, {
        variables: { [profile.memberVariable ?? 'members']: members },
      }));
    if (!pattern) return undefined;
    groups.push({
      slotId: slot.id,
      patternId: pattern.id,
      itemIds: members.map((member) => member.id),
      members,
    });
  }
  return groups;
}

export function enumeratePartitionInterpretations(
  profile: PartitionInterpretationProfile,
  items: PartitionInterpretationItem[],
  source: PartitionInterpretationSource,
): EnumeratedPartitionInterpretation[] {
  assertProfile(profile);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error('Interpretation item ids must be unique.');
  const patterns = new Map(profile.groupPatterns.map((entry) => [entry.id, entry]));
  const proposals: EnumeratedPartitionInterpretation[] = [];
  const seen = new Set<string>();
  const maxProposals = profile.maxProposals ?? 32;

  for (const structure of profile.structures) {
    const alternatives = (ids: string[]): PartitionGroupAlternative[] => ids.map((id) => {
      const pattern = patterns.get(id) as PartitionInterpretationGroupPattern;
      return { id: pattern.id, size: pattern.size, predicate: structuredClone(pattern.predicate) };
    });
    const input: PartitionMacroInput = {
      id: `${profile.id}:${structure.id}:enumerate`,
      items: items.map((item) => ({ id: item.id, attributes: structuredClone(item.attributes) })),
      slots: structure.slots.map((slot) => ({
        id: slot.id,
        count: slot.count,
        alternatives: alternatives(slot.alternatives),
      })),
      memberVariable: profile.memberVariable ?? 'members',
      maxSolutions: profile.candidateLimit ?? 1024,
      maxSteps: profile.maxSteps ?? 500_000,
    };
    const solved = solvePartitionExpansion(expandPartitionMacro(input));
    for (const solution of solved.solutions) {
      const groups = candidateGroups(profile, structure, items, solution.assignment);
      if (!groups) continue;
      if (structure.predicate && !evaluateFormula(structure.predicate, {
        variables: {
          items: items.map((item) => ({ id: item.id, attributes: structuredClone(item.attributes) })),
          groups,
          source,
        },
      })) continue;
      const proposalGroups = groups.map(({ members: _members, ...group }) => group);
      const canonical = {
        profileId: profile.id,
        structureId: structure.id,
        exposureId: source.exposureId,
        sourceEntityId: source.sourceEntityId,
        sourceActorId: source.sourceActorId,
        groups: proposalGroups,
      };
      const key = JSON.stringify(canonical);
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push({
        source: structuredClone(source),
        proposal: {
          proposalId: `interpretation:${stableHash(canonical)}`,
          ...canonical,
        },
      });
      if (proposals.length >= maxProposals) return proposals;
    }
  }
  return proposals;
}
