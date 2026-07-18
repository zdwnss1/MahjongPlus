export interface InternalActionOption {
  id: string;
  label: string;
  kind: 'discard' | 'riichi' | 'tsumo' | 'ron' | 'chi' | 'pon' | 'kan' | 'abort' | 'pass';
  reply: Record<string, string>;
}
