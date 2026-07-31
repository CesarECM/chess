import { supabase } from '@/services/supabase';
import { PRE_ELO_LOWER, PRE_ELO_UPPER } from '@/constants';

const FALLBACK = { low: PRE_ELO_LOWER, high: PRE_ELO_UPPER };

export async function fetchCalibrationConfig(): Promise<{ low: number; high: number }> {
  try {
    const { data, error } = await supabase
      .from('calibration_config')
      .select('lower_bound, upper_bound')
      .eq('id', 1)
      .single();
    if (error || !data) return FALLBACK;
    return {
      low:  (data.lower_bound  as number) ?? FALLBACK.low,
      high: (data.upper_bound as number) ?? FALLBACK.high,
    };
  } catch {
    return FALLBACK;
  }
}
