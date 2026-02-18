export interface MetricHelp {
  labelKey: string
  lineKeys: [string, string, string]
}

export const METRIC_LABELS: Record<
  | 't_peak'
  | 't_50'
  | 'slope_max'
  | 'auc_0_peak'
  | 'spike_score'
  | 'maxTau'
  | 'early_input_ratio'
  | 'late_input_ratio'
  | 'peak_input_time'
  | 'input_stability',
  MetricHelp
> = {
  t_peak: {
    labelKey: 'metrics.t_peak.label',
    lineKeys: [
      'metrics.t_peak.line1',
      'metrics.t_peak.line2',
      'metrics.t_peak.line3',
    ],
  },
  t_50: {
    labelKey: 'metrics.t_50.label',
    lineKeys: [
      'metrics.t_50.line1',
      'metrics.t_50.line2',
      'metrics.t_50.line3',
    ],
  },
  slope_max: {
    labelKey: 'metrics.slope_max.label',
    lineKeys: [
      'metrics.slope_max.line1',
      'metrics.slope_max.line2',
      'metrics.slope_max.line3',
    ],
  },
  auc_0_peak: {
    labelKey: 'metrics.auc_0_peak.label',
    lineKeys: [
      'metrics.auc_0_peak.line1',
      'metrics.auc_0_peak.line2',
      'metrics.auc_0_peak.line3',
    ],
  },
  spike_score: {
    labelKey: 'metrics.spike_score.label',
    lineKeys: [
      'metrics.spike_score.line1',
      'metrics.spike_score.line2',
      'metrics.spike_score.line3',
    ],
  },
  maxTau: {
    labelKey: 'metrics.maxTau.label',
    lineKeys: [
      'metrics.maxTau.line1',
      'metrics.maxTau.line2',
      'metrics.maxTau.line3',
    ],
  },
  early_input_ratio: {
    labelKey: 'metrics.early_input_ratio.label',
    lineKeys: [
      'metrics.early_input_ratio.line1',
      'metrics.early_input_ratio.line2',
      'metrics.early_input_ratio.line3',
    ],
  },
  late_input_ratio: {
    labelKey: 'metrics.late_input_ratio.label',
    lineKeys: [
      'metrics.late_input_ratio.line1',
      'metrics.late_input_ratio.line2',
      'metrics.late_input_ratio.line3',
    ],
  },
  peak_input_time: {
    labelKey: 'metrics.peak_input_time.label',
    lineKeys: [
      'metrics.peak_input_time.line1',
      'metrics.peak_input_time.line2',
      'metrics.peak_input_time.line3',
    ],
  },
  input_stability: {
    labelKey: 'metrics.input_stability.label',
    lineKeys: [
      'metrics.input_stability.line1',
      'metrics.input_stability.line2',
      'metrics.input_stability.line3',
    ],
  },
}
