# DEVICE QUICKSTART

ストア公開なしで、実機確認するための最小手順です。

## Web（URL配布）
1. `https://bahamutonX.github.io/BeyMeter/` を開く
2. BBP を長押しして待機
3. `接続する` を押して `BEYBLADE_TOOL01` を選択

## iOS 実機（最小ターミナル）
```bash
pnpm build
pnpm cap:sync
pnpm cap:open:ios
```
その後:
1. Xcode で Team を設定
2. 実機を選択して Run

## Android 実機（最小ターミナル）
```bash
pnpm build
pnpm cap:sync
pnpm cap:open:android
```
その後:
1. Android Studio で実機を選択して Run

## Android APK 生成（任意）
Android Studio で `Build > Build APK(s)` を実行し、生成 APK を実機へインストールします。

## 補足
- Native BLE は `@capawesome-team/capacitor-bluetooth-low-energy` が必要です。
- private registry の場合は `.npmrc` にトークン設定が必要です。
- デバッグ生ログページは `/rawlog` 直打ちで利用できます（通常画面にリンクなし）。
