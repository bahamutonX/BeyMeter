export interface MetricHelp {
  label: string
  lines: [string, string, string]
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
    label: 't_peak',
    lines: [
      '意味: シュート開始から最大回転に達するまでの時間(ms)',
      '大: 立ち上がりが遅い / 小: 立ち上がりが速い',
      '改善: 初動を強く、引き始めの加速を意識',
    ],
  },
  t_50: {
    label: 't_50',
    lines: [
      '意味: ピークの50%に達するまでの時間(ms)',
      '大: 初速が乗りにくい / 小: 初速が素早く立つ',
      '改善: 引き始めの力の立ち上げを滑らかに',
    ],
  },
  slope_max: {
    label: 'slope_max',
    lines: [
      '意味: 回転数の増え方の最大値（立ち上がりの鋭さ）',
      '大: 一気に加速 / 小: 加速が穏やか',
      '改善: 最初の一押しを強く、迷いを減らす',
    ],
  },
  auc_0_peak: {
    label: 'auc_0_peak',
    lines: [
      '意味: 0〜最初のピークまでの回転総量',
      '大: ピークまでの立ち上がりで稼げる / 小: 初動が弱め',
      '改善: ピークまでの加速を切らさず、出力を繋ぐ',
    ],
  },
  spike_score: {
    label: 'spike_score',
    lines: [
      '意味: 突発スパイクの出やすさ',
      '1に近い: 自然 / 大きい: ノイズ傾向',
      '改善: 引きを急に止めず、一定の抜けにする',
    ],
  },
  maxTau: {
    label: '最大入力トルク',
    lines: [
      '意味: 加速区間から推定した入力の強さ',
      '大: 初動入力が強い / 小: 初動入力が弱い',
      '注意: 単発で断定せず、複数回の傾向で判断',
    ],
  },
  early_input_ratio: {
    label: 'early_input_ratio',
    lines: [
      '意味: 前半入力比率（序盤に入力が集中した割合）',
      '大: 引き始め集中 / 小: 入力が後半寄り',
      '改善: 一定入力型を狙うなら前半偏重を抑える',
    ],
  },
  late_input_ratio: {
    label: 'late_input_ratio',
    lines: [
      '意味: 後半入力比率（ピーク直前の入力割合）',
      '大: 尻上がり型の傾向 / 小: 前半で入力を使い切る傾向',
      '改善: 目標帯域に合わせて後半の伸びを調整',
    ],
  },
  peak_input_time: {
    label: 'peak_input_time',
    lines: [
      '意味: 入力加速が最大になった時刻(ms)',
      '大: 後半で入力ピーク / 小: 早い段階で入力ピーク',
      '改善: 高い帯域を狙う時はピークが遅すぎないよう調整',
    ],
  },
  input_stability: {
    label: 'input_stability',
    lines: [
      '意味: 入力の安定度（小さいほど一定）',
      '大: 力の波が大きい / 小: 一定の力で引けている',
      '改善: 速度変動を減らし、引き切りまで一定を意識',
    ],
  },
}
