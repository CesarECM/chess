import type { PieceSetId } from './boardThemes';

/** Maps a piece key (e.g. 'wK', 'bP') to its SVG URL for a given set. */
export function getPieceUrl(set: PieceSetId, pieceKey: string): string {
  return `/pieces/${set}/${pieceKey}.svg`;
}
