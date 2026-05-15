# iOS Distribution Audit

## Current state

SmartHue is already closest to production on iPhone as a PWA:

- installable from Safari with Home Screen support
- standalone display metadata is already present
- service worker updates are enabled
- SmartThings OAuth already has installed-PWA-aware resume handling
- foreground opportunistic session refresh is now in place for iOS/PWA resume cases

The repo is now also scaffolded for a future native wrapper with Capacitor:

- `@capacitor/core`, `@capacitor/cli`, and `@capacitor/ios` are installed
- `capacitor.config.json` is present
- package scripts exist for `cap:add:ios`, `cap:sync`, and `cap:open:ios`

## What is ready now

### PWA route

This is the only practical no-Apple-fee route today.

Strengths:

- no Apple Developer Program fee required
- users can install from Safari to Home Screen
- app-like launch surface already works
- easiest deployment path for your current architecture

Limits:

- no App Store listing
- no true native entitlement access
- Safari/WebKit constraints still apply
- OAuth/browser handoff is improved but still not as strong as a native universal-link flow

### Native wrapper route

This repo is now prepared for a Capacitor shell, but not fully built.

What still requires macOS:

- create/open the iOS project in Xcode
- run the native simulator/device build
- create signing assets and provisioning
- archive and export the app

## App Store blockers

These are the main blockers before normal App Store submission:

1. Apple Developer Program enrollment is still required.
2. Native iOS build/signing must be completed on macOS with Xcode.
3. App metadata is incomplete for App Store submission:
   - privacy policy URL
   - support URL
   - app description, keywords, screenshots, age rating answers
4. Native assets are not prepared yet:
   - iOS app icons / asset catalog review
   - launch screen validation in Xcode
   - final bundle identifiers and signing settings
5. The OAuth return path should be validated in a true native shell.
   The current PWA flow is solid, but a wrapped app should be tested for browser return, scene restoration, and resume edge cases.
6. App Review policy fit still needs a manual pass.
   SmartHue controls third-party smart-home devices and uses external account sign-in, so the final shipping build should be reviewed against current App Review rules before submission.

## Alternative marketplace blockers

These are the main blockers before Aptoide iOS or another alternative iOS marketplace:

1. Do not assume this avoids Apple participation.
   Alternative iOS distribution still likely requires Apple-side signing, notarization, or marketplace eligibility steps.
2. Marketplace coverage is not equivalent to the normal App Store.
   Availability, geography, and install flow are more constrained.
3. Aptoide's public iOS material is commercial/partner-oriented.
   You should expect onboarding, commercial review, and marketplace-specific requirements.
4. The same native-wrapper readiness work still applies:
   - real iOS project
   - native QA on device
   - signing/notarization readiness
   - marketplace metadata/assets

## Recommended path

### Right now

Ship the PWA and optimize the iPhone install path.

That is already the strongest path if you do not want to pay Apple yet.

### Later, when you are ready for a native package

1. Run `npm run build:native`.
2. On a Mac, run `npm run cap:add:ios` once.
3. Open Xcode with `npm run cap:open:ios`.
4. Validate SmartThings OAuth resume behavior in the native shell.
5. Add signing, metadata, privacy links, screenshots, and submission assets.

## Repo files relevant to this audit

- `capacitor.config.json`
- `package.json`
- `src/components/app-shell.js`
- `src/components/token-setup.js`
- `src/services/smartthings.js`
- `vite.config.js`
- `index.html`
