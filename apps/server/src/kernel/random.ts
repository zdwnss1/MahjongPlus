import { createHash } from 'node:crypto';

export interface RandomSource {
  next(): number;
  int(maxExclusive: number): number;
  fork(label: string): RandomSource;
}

function seedToUint32(seed: string): number {
  const digest = createHash('sha256').update(seed).digest();
  return digest.readUInt32LE(0) || 0x6d2b79f5;
}

export class DeterministicRandom implements RandomSource {
  private state: number;

  constructor(private readonly seed: string) {
    this.state = seedToUint32(seed);
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error('maxExclusive must be a positive integer');
    return Math.floor(this.next() * maxExclusive);
  }

  fork(label: string): RandomSource {
    return new DeterministicRandom(`${this.seed}:${label}`);
  }
}

export function randomSeed(): string {
  return createHash('sha256')
    .update(`${Date.now()}:${process.hrtime.bigint()}:${Math.random()}`)
    .digest('hex');
}
