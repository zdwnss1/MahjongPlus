import type { ProcedureDefinition } from '@mahjongplus/world-language';
import type { ProcedureToken } from './types.js';

export interface SchedulerSnapshot {
  sequence: number;
  tokens: ProcedureToken[];
}

export class ProcedureScheduler {
  private readonly definitions: Map<string, ProcedureDefinition>;
  private readonly tokens = new Map<string, ProcedureToken>();
  private sequence = 0;

  constructor(definitions: ProcedureDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  spawn(procedureId: string, ownerId: string, nodeId?: string, tokenId?: string): ProcedureToken {
    const definition = this.requireDefinition(procedureId);
    const token: ProcedureToken = {
      id: tokenId ?? `procedure-token:${procedureId}:${++this.sequence}`,
      procedureId,
      nodeId: nodeId ?? definition.entryNodeId,
      ownerId,
      localState: {},
    };
    if (this.tokens.has(token.id)) throw new Error(`Duplicate procedure token: ${token.id}`);
    this.requireNode(token);
    this.tokens.set(token.id, token);
    return structuredClone(token);
  }

  find(procedureId: string, nodeId: string, ownerId: string): ProcedureToken | undefined {
    const token = [...this.tokens.values()].find((candidate) =>
      candidate.procedureId === procedureId && candidate.nodeId === nodeId && candidate.ownerId === ownerId);
    return token ? structuredClone(token) : undefined;
  }

  require(tokenId: string): ProcedureToken {
    const token = this.tokens.get(tokenId);
    if (!token) throw new Error(`Unknown procedure token: ${tokenId}`);
    return token;
  }

  transition(tokenId: string, nodeId: string): ProcedureToken {
    const token = this.require(tokenId);
    token.nodeId = nodeId;
    this.requireNode(token);
    return structuredClone(token);
  }

  rotateOwner(tokenId: string, order: string[], nodeId: string): ProcedureToken {
    const token = this.require(tokenId);
    const index = order.indexOf(token.ownerId);
    if (index < 0) throw new Error(`Procedure owner ${token.ownerId} is not in rotation order.`);
    token.ownerId = order[(index + 1) % order.length];
    token.nodeId = nodeId;
    this.requireNode(token);
    return structuredClone(token);
  }

  node(token: ProcedureToken): ReturnType<ProcedureScheduler['requireNode']> {
    return this.requireNode(token);
  }

  all(): ProcedureToken[] {
    return [...this.tokens.values()].map((token) => structuredClone(token));
  }

  snapshot(): SchedulerSnapshot {
    return { sequence: this.sequence, tokens: this.all() };
  }

  restore(snapshot: SchedulerSnapshot): void {
    this.sequence = snapshot.sequence;
    this.tokens.clear();
    for (const token of snapshot.tokens) this.tokens.set(token.id, structuredClone(token));
  }

  private requireDefinition(procedureId: string): ProcedureDefinition {
    const definition = this.definitions.get(procedureId);
    if (!definition) throw new Error(`Unknown procedure: ${procedureId}`);
    return definition;
  }

  private requireNode(token: ProcedureToken) {
    const definition = this.requireDefinition(token.procedureId);
    const node = definition.nodes.find((candidate) => candidate.id === token.nodeId);
    if (!node) throw new Error(`Unknown node ${token.nodeId} in procedure ${token.procedureId}.`);
    return node;
  }
}
