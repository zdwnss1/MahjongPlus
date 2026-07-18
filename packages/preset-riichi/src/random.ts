function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 0x9e3779b9;
}

export class PresetRandom {
  private state: number;

  constructor(readonly seed: string) {
    this.state = hashSeed(seed);
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) throw new Error('Random upper bound must be positive.');
    return Math.floor(this.next() * maxExclusive);
  }

  fork(label: string): PresetRandom {
    return new PresetRandom(`${this.seed}:${label}`);
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.int(index + 1);
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }
}
