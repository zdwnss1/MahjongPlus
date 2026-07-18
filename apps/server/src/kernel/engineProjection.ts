import type { PlayerSummary, TileInstanceView } from '@mahjongplus/shared';
import { tilesFromHandString } from '../engine/engineEvents.js';
import { TileIdentityLedger } from './tileLedger.js';
import type { TileSetDefinition } from './tileSet.js';

export class EngineTileProjector {
  private readonly ledger: TileIdentityLedger;
  constructor(private readonly players: PlayerSummary[], tileSet: TileSetDefinition) { this.ledger = new TileIdentityLedger(tileSet); }
  capture(model: any): Map<string, TileInstanceView[]> {
    const locations: Array<{ location: string; faces: string[] }> = [];
    for (let engineId = 0; engineId < this.players.length; engineId += 1) {
      const player = this.players[engineId];
      const wind = model.player_id?.indexOf(engineId) ?? engineId;
      const shoupai = wind >= 0 ? model.shoupai?.[wind] : undefined;
      locations.push({ location: `hand:${player.id}`, faces: tilesFromHandString(shoupai?.toString?.() ?? '') });
      locations.push({ location: `river:${player.id}`, faces: model.he?.[wind]?._pai?.map((tile: string) => tile.slice(0, 2)) ?? [] });
    }
    locations.push({ location: 'dora', faces: model.shan?.baopai ? [...model.shan.baopai] : [] });
    return this.ledger.reconcile(locations);
  }
}
