# BeyMeter (English)

**BeyMeter is a practical shot-improvement analytics app for BEYBLADE players.**  
It connects to BEYBLADE Battle Pass and provides immediate feedback without waiting for long official-app animations.

- Web Demo: https://bahamutonX.github.io/BeyMeter/
- Repository: https://github.com/bahamutonX/BeyMeter

## 1. What makes it useful
- **Instant feedback**: Recorded Shot Power appears right after each shot
- **Per-shot metrics**: Peak time, AUC-to-peak, and input torque behavior
- **Time-series graph**: Shot Power + Input Torque (relative) in one chart
- **Band comparison**: Aggregate and compare multi-shot behavior by power band
- **Effective length estimate**: AUC ratio against launcher theory values

## 1.1 Lite vs Pro
- **Lite**: Focused Bey Meter view for quick measurement
- **Pro**: Full tabs for Detail analysis, Raw Log, and history/band comparison
- In Lite mode, tapping Pro-only tabs opens an upgrade modal (IAP upsell flow placeholder)

## 2. Supported platforms
- Web: Chrome / Edge (Web Bluetooth)
- iOS: Capacitor native app
- Android: Capacitor native app

## 3. Quick start
1. Select launcher type (String / Winder / Long/Dragon)
2. Press and hold the Battle Pass button (pairing state)
3. Tap `Connect` in BeyMeter
4. Shoot
5. Review `Shot Analysis` and `History & Analysis`

## 4. Screen structure
### 4.1 Shot Analysis (single shot)
Two grouped blocks are shown:

- **Shot Power Analysis**
  - Shot Power Peak (ms, rpm)
  - AUC to Peak
  - Effective Length (`measured AUC / theoretical AUC`)

- **Input Torque Analysis**
  - Input Torque Peak (ms, rpm/ms)
  - Input Torque Peak Position (%)
  - Shot Type (Front-loaded / Constant / Back-loaded)

### 4.2 History & Analysis (multi-shot)
- Select a shot-power band
- Compare overlaid waveforms in the selected band
- Two detail boxes:
  - Shot Power Analysis (averaged)
  - Input Torque Analysis (averaged)
- Band stats also show launcher-wise effective length/rate (mean/SD)

## 5. Launcher constants (fixed)
Used for effective-length estimation.

- String: max rev 11 / theoretical AUC 660,000 / full length 50.0 cm
- Winder: max rev 8 / theoretical AUC 480,000 / full length 20.5 cm
- Long/Dragon: max rev 9 / theoretical AUC 540,000 / full length 22.5 cm

## 6. Development
```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

### Capacitor sync
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

## 7. Pro / IAP preparation
- Entitlement abstraction: `src/features/entitlement.ts`
- Integration notes for StoreKit / Play Billing swap: `docs/IAP_PREP.md`

## 8. License
MIT License

## 9. Author
by [@bahamutonX](https://x.com/bahamutonX)
