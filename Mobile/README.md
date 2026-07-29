# Style Studio — Mobile App

Expo SDK 54 (React Native) app with expo-router and Clerk authentication.
Standalone extract of the `style-studio-mobile` app plus the shared
`lib/api-client-react` library (generated typed API hooks).

## Requirements
- Node.js 20+
- pnpm 9+ (`npm i -g pnpm`)
- Expo Go on your phone (for dev) or EAS CLI (for store builds)
- The Style Studio backend API running somewhere reachable

## Setup
```bash
pnpm install
cp .env.example .env   # fill in values, then export them
```

## Run locally
```bash
export EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
export EXPO_PUBLIC_DOMAIN=<host:port where the backend API runs>
cd artifacts/style-studio-mobile
pnpm run typecheck -w ../.. 2>/dev/null || (cd ../.. && pnpm run typecheck)  # first time only: builds shared library types
pnpm exec expo start
```
Scan the QR code with Expo Go. `EXPO_PUBLIC_DOMAIN` tells the app where to find
the backend API (`https://$EXPO_PUBLIC_DOMAIN/api/*`).

## Build for production
Use EAS (Expo Application Services) for iOS/Android binaries:
```bash
npm i -g eas-cli
cd artifacts/style-studio-mobile
eas build --platform all
```
There is also a web export (`pnpm --filter @workspace/style-studio-mobile run build`)
that produces a static web build served by `server/serve.js`.

## Deploy
- Native: submit EAS builds to the App Store / Play Store (`eas submit`).
- The app only needs the backend API to be reachable over HTTPS; there is no
  mobile server component to host on AWS beyond the backend itself.

## Inter-service communication
- Calls the backend at `https://$EXPO_PUBLIC_DOMAIN/api/*` with Clerk Bearer tokens.
