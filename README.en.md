# BeyMeter (English)

BeyMeter is an app that connects to BEYBLADE Battle Pass and analyzes shot waveforms and history.

- Available as a Web app (PC Chrome/Edge) via URL
- Runs on iOS / Android as a Capacitor native app
- BLE layer is swappable between Web / Native
- UI auto-switches `ja/en` by OS/browser language (no manual toggle)

## Web URL
- https://bahamutonX.github.io/BeyMeter/

## Supported Environments
- Web: Google Chrome / Microsoft Edge (Web Bluetooth required)
- iOS: Capacitor + CoreBluetooth (Safari alone is not supported)
- Android: Capacitor + BLE

## How to Use (Web/PC)
1. Long-press the Battle Pass button to enter pairing mode
2. Click `Connect` in the header
3. Select `BEYBLADE_TOOL01` from the device picker
4. Choose your launcher type in the header, then start measuring

## UI Overview

### Mobile UI (iOS/Android)
- 3-page swipe UI
  - Left: Settings / Connection
  - Center: Shot Analysis
  - Right: History & Analysis
- Bottom `○●○` indicator can also be tapped to move between pages

### Shot Analysis
- Recorded Shot Power
  - Value recorded by the Battle Pass device
- Estimated SP
  - Corrected value inferred from the waveform
- Max SP
  - Peak value in the waveform
- Launcher
  - Launcher type used for that shot
- Shot Type
  - Pattern classification from waveform features
  - (early-focus / late-boost / steady-input / fluctuating)

### Latest Shot Waveform
- X-axis: Time (ms)
- Toggle between `Shot Power` and `Torque (a.u.)`
- Peak time and max value are shown at the top-right

### History & Analysis
- History is grouped by shot-power bands (step = 1000)
- Per band:
  - Total count
  - Launcher breakdown (3 types)
  - Mean / Max / Standard deviation
- Detail metrics (mean / p50):
  - Max input torque
  - t_50
  - t_peak
  - slope_max
  - auc_0_peak
  - spike_score
  - early_input_ratio / late_input_ratio / peak_input_time / input_stability
- Tap `ⓘ` on each metric for explanations

## Launcher Recording
- Choose launcher with 3 buttons in the header:
  - String Launcher
  - Winder Launcher
  - Long Winder
- Selected launcher is persisted with each shot
- Band statistics can compare launcher counts

## Debug Page
- `/rawlog` is the raw packet log page
- It is not linked from normal UI (direct URL only)

## Development
```bash
pnpm install
pnpm dev
```

## i18n
- Libraries:
  - `i18next`
  - `react-i18next`
  - `i18next-browser-languagedetector`
- Initialization:
  - `src/i18n.ts`
  - Detection source: `navigator` only
  - `supportedLngs = ['en', 'ja']`
  - `fallbackLng = 'en'`
  - `load = 'languageOnly'` (`ja-JP` -> `ja`)
- Translation files:
  - `src/locales/en/translation.json`
  - `src/locales/ja/translation.json`

### Translation Rules
- Use dot-separated key naming by feature scope
  - Example: `recent.title`, `ble.connected`, `metrics.t_peak.label`
- Use `useTranslation()` in React components (no hardcoded UI strings)
- Use interpolation with `t('key', { value })`

After native BLE updates:
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
- Repository: `https://github.com/bahamutonX/BeyMeter`
- Build Pages bundle:
```bash
pnpm build:pages
```

Notes:
- Assumes `VITE_BASE_PATH=/BeyMeter/`
- `/rawlog` is also reachable via 404 rewrite routing

## iOS Device Run
```bash
pnpm build
pnpm cap:sync
pnpm cap:open:ios
```

First time only:
```bash
pnpm ios:add
```

Notes:
- Native BLE uses `@capacitor-community/bluetooth-le`
- Run on device from Xcode after Team signing setup

## Android Device Run
```bash
pnpm build
pnpm cap:sync
pnpm cap:open:android
```

First time only:
```bash
pnpm android:add
```

Notes:
- Native BLE uses `@capacitor-community/bluetooth-le`

## License
MIT License (`LICENSE`)

## Author
- by [@bahamutonX](https://x.com/bahamutonX)
