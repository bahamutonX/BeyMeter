# BeyMeter（日本語）

BeyMeter は、BEYBLADE Battle Pass（ベイバトルパス）と接続して、シュート波形と履歴を解析するアプリです。

- Web（PC Chrome/Edge）で URL 配布して利用可能
- iOS / Android は Capacitor ネイティブアプリとして実機動作
- BLE 層を Web / Native で差し替える構成
- UI は `ja/en` 自動切替（OS/ブラウザ優先言語、手動トグルなし）

## 配布 URL（Web）
- https://bahamutonX.github.io/BeyMeter/

## 動作環境
- Web: Google Chrome / Microsoft Edge（Web Bluetooth 対応）
- iOS: Capacitor + CoreBluetooth（Safari 単体は不可）
- Android: Capacitor + BLE

## 使い方（Web/PC）
1. ベイバトルパスのボタンを長押しして待機状態にする
2. 画面上部の `接続する` を押す
3. デバイス選択で `BEYBLADE_TOOL01` を選ぶ
4. ヘッダーの `ランチャー` を選択してから計測する

## 画面の見方

### スマホUI（iOS/Android）
- 3画面の横スワイプUI
  - 左: 設定・接続
  - 中央: シュート解析
  - 右: 履歴と分析
- 画面下の `○●○` インジケーターはタップでもページ移動可能
- 接続時はガイドモーダルを表示（長押し案内）
  - 成功: 「接続できました」
  - 失敗/タイムアウト: エラーメッセージ表示
  - `キャンセル` で途中中断可能

### シュート解析
- 記録シュートパワー
  - ベイバトルパス本体に記録された値（現在のメイン表示）
- ランチャー
  - そのショットで使用したランチャー種別
- シュートタイプ
  - 波形特徴から分類したタイプ（引き始め集中型 / 尻上がり型 / 一定入力型 / 波あり型）

### 直近のシュート波形
- 横軸: 時間（ms）
- `シュートパワー` / `入力トルク（相対値）` の表示切替
- 右上にピーク時刻と最大シュートパワーを表示

### 履歴と分析
- シュートパワー帯域（1000刻み）で履歴を分類
- 帯域ごとに:
  - 合計本数
  - ランチャー内訳（3種類）
  - 平均 / 最高 / 標準偏差
- 詳細データ（平均=mean / 中央値=p50）
  - 最大入力トルク（相対値）
  - t_50
  - t_peak
  - slope_max
  - auc_0_peak
  - spike_score
  - early_input_ratio / late_input_ratio / peak_input_time / input_stability
- 各指標の `ⓘ` で意味を確認可能

## ランチャー記録
- ヘッダーの3択ボタンでランチャーを選択
  - ストリング
  - ワインダー
  - ロング／ドラゴン
- 選択値はショット保存時に一緒に永続化
- 帯域統計でランチャー別の本数比較が可能

## デバッグページ
- `/RawLog` は生ログ確認用ページ
- 通常画面からはリンクしていません（直打ち専用）

## 開発
```bash
pnpm install
pnpm dev
```

## i18n（多言語）
- 使用ライブラリ:
  - `i18next`
  - `react-i18next`
  - `i18next-browser-languagedetector`
- 初期化:
  - `src/i18n.ts`
  - 言語検出は `navigator` のみ
  - `supportedLngs = ['en', 'ja']`
  - `fallbackLng = 'en'`
  - `load = 'languageOnly'`（`ja-JP` -> `ja`）
- 翻訳ファイル:
  - `src/locales/en/translation.json`
  - `src/locales/ja/translation.json`

### 翻訳追加ルール
- キー命名はドット区切りで用途ごとに分割
  - 例: `recent.title`, `ble.connected`, `metrics.t_peak.label`
- Reactコンポーネントでは `useTranslation()` を使い、ハードコードを避ける
- 補間は `t('key', { value })` を利用

Native BLE を更新した場合:
```bash
pnpm cap:sync
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
- `/RawLog` も 404 リライト経由で表示可能

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

補足:
- Native BLE は `@capacitor-community/bluetooth-le` を利用
- iOS は Xcode で Team 設定後に実機 Run

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

補足:
- Native BLE は `@capacitor-community/bluetooth-le` を利用

## ライセンス
MIT License（`LICENSE`）

## Author
- by [@bahamutonX](https://x.com/bahamutonX)
