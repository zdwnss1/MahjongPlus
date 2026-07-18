import type { TileInstanceView } from '@mahjongplus/shared';

export function Tile({ value }: { value: string | TileInstanceView }) {
  const face = typeof value === 'string' ? value : value.face;
  const red = typeof value !== 'string' && value.traits.includes('red');
  return <span className={`tile tile-${face[0]} ${red ? 'red-tile' : ''}`}>{face}</span>;
}
