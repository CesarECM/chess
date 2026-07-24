export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
