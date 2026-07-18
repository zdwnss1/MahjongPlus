import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSTITUTION } from '../src/constitution.js';
import { GovernanceMachine } from '../src/governanceMachine.js';
import { RecordingRuleCompiler } from '../src/ruleCompiler.js';

describe('GovernanceMachine', () => {
  it('keeps published artifacts after the final rule slot closes', async () => {
    const players = [{ id: 'east', isBot: false }, { id: 'south', isBot: true }, { id: 'west', isBot: true }, { id: 'north', isBot: true }];
    const machine = new GovernanceMachine(players, players.map((player) => player.id), { ...DEFAULT_CONSTITUTION, ruleSlotsPerPlayer: 1 }, new RecordingRuleCompiler());
    expect(machine.normalize().finished).toBe(false);
    const submitted = await machine.submit('east', '第一次立直后获得2000点');
    expect(submitted.finished).toBe(false); expect(machine.state.proposal?.stage).toBe('author-confirmation');
    const confirmed = machine.confirm('east');
    expect(confirmed.finished).toBe(true); expect(machine.acceptedRules).toHaveLength(1); expect(machine.acceptedRules[0].originalText).toBe('第一次立直后获得2000点');
  });
});
