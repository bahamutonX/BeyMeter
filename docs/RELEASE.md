# RELEASE

## 1. ローカル実機起動（iOS）
1. `pnpm build`
2. `pnpm cap:sync`
3. `pnpm cap:open:ios`
4. Xcode で Team / Bundle Identifier を設定
5. iPhone / iPad 実機を選択して Run

## 2. TestFlight 配布
1. Xcode で `Any iOS Device` を選択
2. `Product > Archive`
3. Organizer から `Distribute App`
4. `App Store Connect` へ Upload
5. App Store Connect 側でビルド処理完了後、TestFlight に追加

## 3. Android 実機起動
1. `pnpm build`
2. `pnpm android:sync`
3. `pnpm android:open`
4. Android Studio で SDK / Device を設定
5. 実機を選択して Run

## 4. GitHub Releases / Web 配布
1. `pnpm build:pages`
2. `dist/` を GitHub Pages にデプロイ（Actions 推奨）
3. タグを打って GitHub Release 作成
4. Release Notes に Web デモ URL を記載
