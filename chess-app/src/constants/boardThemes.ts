export type BoardThemeId = 'classic' | 'ocean' | 'emerald';
export type PieceSetId   = 'cburnett' | 'merida' | 'alpha';

export interface BoardTheme {
  id:        BoardThemeId;
  light:     string;
  dark:      string;
  /** RGB triple for selection + last-move highlights.
   *  classic → forest green (industry standard on wood boards)
   *  ocean   → amber gold   (warm contrast against cool blue-gray)
   *  emerald → cobalt blue  (green-on-green is invisible; blue maximises contrast) */
  highlight: [number, number, number];
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  classic: { id: 'classic', light: '#F0D9B5', dark: '#B58863', highlight: [20,  85,  30]  },
  ocean:   { id: 'ocean',   light: '#DEE3E6', dark: '#8CA2AD', highlight: [200, 150, 20]  },
  emerald: { id: 'emerald', light: '#FFFFDD', dark: '#86A666', highlight: [30,  120, 200] },
};

export const PIECE_SETS: PieceSetId[] = ['cburnett', 'merida', 'alpha'];
