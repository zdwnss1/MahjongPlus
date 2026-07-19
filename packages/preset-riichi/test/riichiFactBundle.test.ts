import { describe, expect, it } from 'vitest';
import { compileWorld } from '@mahjongplus/world-language';
import { WorldRuntime } from '@mahjongplus/world-runtime';
import { createSuperRiichiRuleFixture } from '../src/superRiichi.js';

const TRACKS = {
  transfers: 'track:resource-transfers',
  declarations: 'track:public-declarations',
  contributions: 'track:score-contributions',
  discardPolicies: 'track:discard-policies',
  furitenPolicies: 'track:furiten-policies',
} as const;

function runtime(options: Parameters<typeof createSuperRiichiRuleFixture>[0] = {}) {
  return new WorldRuntime(compileWorld(createSuperRiichiRuleFixture(options).source));
}

function declare(value: WorldRuntime, attemptId: string, actorId: string, mode: 'standard' | 'super') {
  return value.attempt({
    attemptId,
    actorId,
    actionId: 'declare-riichi',
    observedRevision: value.currentRevision,
    parameters: { mode },
  });
}

function records(value: WorldRuntime, trackId: string): Array<Record<string, unknown>> {
  const component = value.store.readComponent<{ records: Array<Record<string, unknown>> }>(trackId, 'factTrack');
  return component?.records ?? [];
}

const BUNDLE_EVENT_TYPES = [
  'resource.transferred',
  'declaration.published',
  'score-contribution.granted',
  'discard-policy.activated',
  'furiten-policy.activated',
  'reveal-track.updated',
];

describe('riichi declaration as an atomic fact bundle', () => {
  it('commits independent stake, declaration, scoring, discard, furiten, and reveal facts', () => {
    const value = runtime({ scope: 'owner-only', ownerId: 'east' });
    expect(declare(value, 'south-standard', 'south', 'standard').outcome).toBe('executed');

    const transfer = records(value, TRACKS.transfers)[0];
    expect(transfer).toMatchObject({
      actorId: 'south',
      mode: 'standard',
      asset: 'points',
      fromAccountId: 'south',
      toAccountId: 'riichi-pot',
      amount: 1000,
    });
    expect(records(value, TRACKS.declarations)[0]).toMatchObject({
      actorId: 'south', declarationType: 'riichi', audience: 'all', state: 'published',
    });
    expect(records(value, TRACKS.contributions)[0]).toMatchObject({
      subjectId: 'south', dimension: 'han', operation: 'add', amount: 1, stage: 'base-yaku',
    });
    expect(records(value, TRACKS.discardPolicies)[0]).toMatchObject({
      subjectId: 'south', policyType: 'discard-selection', allowedSource: 'latest-draw', lifetime: 'until-hand-end',
    });
    expect(records(value, TRACKS.furitenPolicies)[0]).toMatchObject({
      subjectId: 'south',
      policyType: 'missed-win-lock',
      triggerEventType: 'win-claim.passed',
      resultingState: 'furiten',
      furitenClass: 'riichi-pass',
      lifetime: 'until-hand-end',
    });

    const events = value.journal.all();
    const bundleEvents = events.filter((event) => BUNDLE_EVENT_TYPES.includes(event.type));
    expect(bundleEvents.map((event) => event.type)).toEqual(BUNDLE_EVENT_TYPES);
    expect(events.some((event) => event.type === 'riichi.declared')).toBe(false);
    expect(new Set(bundleEvents.map((event) => event.causedByActionId)).size).toBe(1);
    const correlationId = transfer.correlationId;
    expect(correlationId).toBe(bundleEvents[0]?.causedByActionId);
    for (const trackId of Object.values(TRACKS)) {
      expect(records(value, trackId)[0]?.correlationId).toBe(correlationId);
    }
  });

  it('lets super mode change payment and reveal while preserving other riichi modules', () => {
    const value = runtime({ scope: 'global', indicatorPolicy: 'standard-cap' });
    expect(declare(value, 'east-super', 'east', 'super').outcome).toBe('executed');

    expect(records(value, TRACKS.transfers)[0]?.amount).toBe(5000);
    expect(records(value, TRACKS.contributions)[0]).toMatchObject({ amount: 1, dimension: 'han' });
    expect(records(value, TRACKS.discardPolicies)[0]?.allowedSource).toBe('latest-draw');
    expect(records(value, TRACKS.furitenPolicies)[0]?.furitenClass).toBe('riichi-pass');

    const reveal = value.store.readComponent<{ revealedCount: number; revealed: unknown[] }>(
      'track:dora-indicators',
      'revealTrack',
    );
    expect(reveal?.revealedCount).toBe(2);
    expect(reveal?.revealed).toHaveLength(2);
  });

  it('can alter the scoring contribution without changing stake, lock, or reveal semantics', () => {
    const value = runtime({ riichiHan: 2, indicatorPolicy: 'standard-cap' });
    expect(declare(value, 'east-standard', 'east', 'standard').outcome).toBe('executed');

    expect(records(value, TRACKS.transfers)[0]?.amount).toBe(1000);
    expect(records(value, TRACKS.contributions)[0]?.amount).toBe(2);
    expect(records(value, TRACKS.discardPolicies)[0]?.allowedSource).toBe('latest-draw');
    expect(records(value, TRACKS.furitenPolicies)[0]?.lifetime).toBe('until-hand-end');
    expect(value.store.readComponent<{ revealedCount: number }>('track:dora-indicators', 'revealTrack')?.revealedCount)
      .toBe(0);
  });

  it('does not create partial facts when the declaration is rejected', () => {
    const value = runtime({ scope: 'owner-only', ownerId: 'east' });
    expect(declare(value, 'south-super', 'south', 'super').outcome).toBe('rejected');
    for (const trackId of Object.values(TRACKS)) expect(records(value, trackId)).toEqual([]);
    expect(value.journal.all().filter((event) => BUNDLE_EVENT_TYPES.includes(event.type))).toEqual([]);
  });
});
