# BeyMeter（日本語）

**BeyMeter は、シュートパワー改善のための実戦解析アプリです。**  
ベイバトルパスと接続し、公式アプリの長いアニメーション待ちなしで、シュート結果を即時に確認できます。

- Web版: https://bahamutonX.github.io/BeyMeter/
- リポジトリ: https://github.com/bahamutonX/BeyMeter

## 1. アプリの強み
- **即時表示**: 記録シュートパワーをすぐ確認
- **詳細解析**: 1本ごとのピーク時刻・AUC・入力トルクを可視化
- **経時グラフ**: シュートパワーと入力トルク（相対値）を同時表示
- **帯域比較**: 3000以上を1000刻みで集計し、複数ショットを比較
- **有効長推定**: ランチャー理論AUCとの比から、実際に使えた有効長を表示

## 2. 動作環境
- Web: Chrome / Edge（Web Bluetooth対応）
- iOS: Capacitorネイティブアプリ
- Android: Capacitorネイティブアプリ

## 3. 使い方
1. ランチャー種別を選択（ストリング / ワインダー / ロング／ドラゴン）
2. ベイバトルパスを長押しして待機状態にする
3. アプリで「接続する」を押す
4. シュートする
5. 「シュート解析」と「履歴と分析」を確認する

## 4. 画面構成
### 4.1 シュート解析（単回）
表示項目は2ブロックに整理しています。

- **シュートパワーの解析**
  - シュートパワーピーク（ms, rpm）
  - ピークまでのAUC
  - 有効長（`実測AUC / 理論AUC` で算出）

- **入力トルクの解析**
  - 入力トルクピーク（ms, rpm/ms）
  - 入力トルクピーク位置（%）
  - シュートタイプ（前半型 / 一定型 / 後半型）

### 4.2 履歴と分析（複数）
- シュートパワー帯域を選択
- 帯域グラフで複数ショットを重ねて比較
- 詳細データを2ボックス表示
  - シュートパワーの解析（平均）
  - 入力トルクの解析（平均）
- 帯域統計でランチャー別の有効長・有効率（平均/SD）を表示

## 5. ランチャー理論値（固定）
有効長の算出に使用する固定値です。

- ストリング: 最大11回転 / 理論AUC 660,000 / 全長 50.0cm
- ワインダー: 最大8回転 / 理論AUC 480,000 / 全長 20.5cm
- ロング／ドラゴン: 最大9回転 / 理論AUC 540,000 / 全長 22.5cm

## 6. 開発
```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

### Capacitor同期
```bash
pnpm exec cap sync
```

### iOS
```bash
pnpm exec cap open ios
```

### Android
```bash
pnpm exec cap open android
```

## 7. Pro / IAP 下準備
- Entitlement抽象層: `src/features/entitlement.ts`
- StoreKit / Play Billing への差し替え手順メモ: `docs/IAP_PREP.md`

## 8. ライセンス
MIT License

## 9. Author
by [@bahamutonX](https://x.com/bahamutonX)
