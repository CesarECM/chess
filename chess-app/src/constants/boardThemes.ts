export type BoardThemeId = 'classic' | 'ocean' | 'emerald';
export type PieceSetId   = 'cburnett' | 'merida' | 'alpha';

export interface BoardTheme {
  id:    BoardThemeId;
  light: string;
  dark:  string;
}

export const BOARD_THEMES: Record<BoardThemeId, BoardTheme> = {
  classic: { id: 'classic', light: '#F0D9B5', dark: '#B58863' },
  ocean:   { id: 'ocean',   light: '#DEE3E6', dark: '#8CA2AD' },
  emerald: { id: 'emerald', light: '#FFFFDD', dark: '#86A666' },
};

export const PIECE_SETS: PieceSetId[] = ['cburnett', 'merida', 'alpha'];
