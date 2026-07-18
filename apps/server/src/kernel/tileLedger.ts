import { nanoid } from 'nanoid';
import type { TileInstanceView } from '@mahjongplus/shared';
import type { TileSetDefinition } from './tileSet.js';

export interface TileLocationSnapshot {
  location: string;
  faces: string[];
}

function traitsFor(face: string, tileSet: TileSetDefinition): string[] {
  return [...(tileSet.kinds.find((kind) => kind.face === face)?.traits ?? [])];
}

export class TileIdentityLedger {
  private locations = new Map<string, TileInstanceView[]>();

  constructor(private readonly tileSet: TileSetDefinition) {}

  reconcile(snapshots: TileLocationSnapshot[]): Map<string, TileInstanceView[]> {
    const desiredLocations = new Set(snapshots.map((snapshot) => snapshot.location));
    const unassigned = new Map<string, TileInstanceView[]>();

    for (const [location, instances] of this.locations) {
      if (!desiredLocations.has(location)) {
        for (const instance of instances) {
          const list = unassigned.get(instance.face) ?? [];
          list.push(instance);
          unassigned.set(instance.face, list);
        }
      }
    }

    const next = new Map<string, TileInstanceView[]>();
    for (const snapshot of snapshots) {
      const previous = this.locations.get(snapshot.location) ?? [];
      const remaining = [...previous];
      const assigned: TileInstanceView[] = [];

      for (const face of snapshot.faces) {
        const sameLocationIndex = remaining.findIndex((instance) => instance.face === face);
        if (sameLocationIndex >= 0) {
          assigned.push(remaining.splice(sameLocationIndex, 1)[0]);
          continue;
        }
        const pool = unassigned.get(face) ?? [];
        const reused = pool.shift();
        unassigned.set(face, pool);
        assigned.push(reused ?? {
          id: `tile_${nanoid(12)}`,
          face,
          physicalFace: face,
          traits: traitsFor(face, this.tileSet),
        });
      }

      for (const instance of remaining) {
        const list = unassigned.get(instance.face) ?? [];
        list.push(instance);
        unassigned.set(instance.face, list);
      }
      next.set(snapshot.location, assigned);
    }

    this.locations = next;
    return new Map([...next].map(([location, instances]) => [location, instances.map((instance) => ({ ...instance, traits: [...instance.traits] }))]));
  }

  find(location: string, tileId: string): TileInstanceView | undefined {
    return this.locations.get(location)?.find((tile) => tile.id === tileId);
  }
}
