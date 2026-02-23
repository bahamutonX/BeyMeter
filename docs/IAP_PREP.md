# IAP Preparation Notes

This app now has an entitlement abstraction in `src/features/entitlement.ts`.

## Current behavior
- Pro flag is stored in localStorage key: `beymeter:isPro`
- UI reads only `getEntitlement().isPro`
- Development toggle API exists: `setProForDev(boolean)`

## Swapping to real IAP later
Replace the provider by calling:

```ts
setEntitlementProvider(yourIapProvider)
```

Your provider should implement `EntitlementProvider`:
- `getSnapshot()`: current entitlement state
- `subscribe(onState)`: push entitlement updates from StoreKit/Play Billing
- `refresh()`: optional server/store refresh
- `setProForDev()`: optional (can be omitted in production provider)

## Recommended native flow
1. App boot: initialize native billing SDK.
2. Build provider from native bridge state.
3. Call `setEntitlementProvider(provider)`.
4. UI updates automatically through `subscribeEntitlement`.

## State fields
- `isPro`: gate flag used by UI
- `source`: `local-dev` / `native-iap` / `unknown`
- `updatedAt`: timestamp for freshness/debug
- `productId`: active product ID if available

