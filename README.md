# BeyMeter

BeyMeter は、BEYBLADE Battle Pass（BBP）と接続して、シュート波形と履歴を解析するアプリです。

- Web（PC Chrome/Edge）で URL 配布して利用可能
- iOS / Android は Capacitor ネイティブアプリとして実機動作
- BLE 層を Web / Native で差し替える構成

## 配布 URL（Web）
- https://bahamutonX.github.io/BeyMeter/

## 動作環境
- Web: Google Chrome / Microsoft Edge（Web Bluetooth 対応）
- iOS: Capacitor + CoreBluetooth（Safari 単体は不可）
- Android: Capacitor + BLE

## 使い方（Web/PC）
1. BBP のボタンを長押しして待機状態にする
2. 画面上部の `接続する` を押す
3. デバイス選択で `BEYBLADE_TOOL01` を選ぶ
4. ヘッダーの `ランチャー` を選択してから計測する

## 画面の見方

### 直近のシュート
- 記録シュートパワー
  - BBP本体に記録された値
- 推定シュートパワー
  - 波形から補正した値
- 最大シュートパワー
  - 波形中のピーク値
- ランチャー
  - そのショットで使用したランチャー種別
- シュートタイプ
  - 波形特徴から分類したタイプ（引き始め集中型 / 尻上がり型 / 一定入力型 / 波あり型）

### 直近のシュート波形
- 横軸: 時間（ms）
- `シュートパワー` / `トルク(a.u.)` の表示切替
- 右上にピーク時刻と最大値を表示

### 履歴と分析
- シュートパワー帯域（1000刻み）で履歴を分類
- 帯域ごとに:
  - 合計本数
  - ランチャー内訳（3種類）
  - 平均 / 最高 / 標準偏差
- 詳細データ（mean=平均 / p50=中央値）
  - 最大入力トルク
  - t_50
  - t_peak
  - slope_max
  - auc_0_peak
  - spike_score
  - early_input_ratio / late_input_ratio / peak_input_time / input_stability
- 各指標の `ⓘ` で意味を確認可能

## ランチャー記録
- ヘッダーの3択ボタンでランチャーを選択
  - ストリングランチャー
  - ワインダーランチャー
  - ロングワインダー
- 選択値はショット保存時に一緒に永続化
- 帯域統計でランチャー別の本数比較が可能

## デバッグページ
- `/rawlog` は生ログ確認用ページです
- 通常画面からはリンクしていません（直打ち専用）

## 開発

```bash
pnpm install
pnpm dev
```

### scripts
```bash
pnpm dev
pnpm build
pnpm lint
pnpm preview
pnpm build:pages
pnpm preview:pages
pnpm cap:sync
pnpm cap:open:ios
pnpm cap:open:android
pnpm ios:add
pnpm ios:sync
pnpm ios:open
pnpm android:add
pnpm android:sync
pnpm android:open
```

## GitHub Pages
- リポジトリ: `https://github.com/bahamutonX/BeyMeter`
- Pages ビルド:

```bash
pnpm build:pages
```

補足:
- `VITE_BASE_PATH=/BeyMeter/` 前提
- `/rawlog` も 404 リライト経由で表示可能

## iOS 実機起動
```bash
pnpm build
pnpm cap:sync
pnpm cap:open:ios
```

初回のみ:
```bash
pnpm ios:add
```

## Android 実機起動
```bash
pnpm build
pnpm cap:sync
pnpm cap:open:android
```

初回のみ:
```bash
pnpm android:add
```

## ライセンス
MIT License（`LICENSE`）

## Author
- by [@bahamutonX](https://x.com/bahamutonX)
