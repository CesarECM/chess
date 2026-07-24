import { ELO_RANGES } from '@/constants';

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export type EloRange = typeof ELO_RANGES[keyof typeof ELO_RANGES];

export function getRangeFromElo(elo: number): EloRange {
  const match = (Object.values(ELO_RANGES) as EloRange[]).find(
    (r) => elo >= r.min && elo < r.max,
  );
  return match ?? ELO_RANGES.KING;
}
