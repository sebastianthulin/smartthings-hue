# SmartHue
SmartThings but with the Philips HUE experience; this repository tries to replicate a smooth philips hue apperance, function and philosophy for lights i smartthings. 

It has one focus; to be the most enjoyable "daily-driver" app for smartthings. 

## SmartThings OAuth login

The app now uses SmartThings OAuth instead of Personal Access Tokens. SmartThings access tokens still expire, but the app stores the returned refresh token and renews the session automatically.

Because SmartThings requires a `client_secret`, the browser app cannot complete the OAuth code exchange on its own. A small broker is included in this repo for the code exchange and refresh steps.

If no OAuth frontend env is configured, the app falls back to the legacy Personal Access Token screen.

### 1. Create a SmartThings OAuth app

Create an OAuth-In SmartApp with the SmartThings CLI and register the redirect URI for your deployed app URL.

You will need:

- a `client_id`
- a `client_secret`
- scopes that cover this app's reads and commands, for example `r:locations:* r:rooms:* r:devices:* x:devices:*`

### 2. Configure the frontend

Create a local `.env` file from `.env.example` and set these values:

```bash
VITE_SMARTTHINGS_CLIENT_ID=your-smartthings-client-id
VITE_SMARTTHINGS_BROKER_URL=http://localhost:8787
VITE_SMARTTHINGS_SCOPES=r:locations:* r:rooms:* r:devices:* x:devices:*
```

### 3. Configure and run the OAuth broker

The broker exchanges the authorization code and refresh token with SmartThings while keeping the `client_secret` out of the browser.

```bash
SMARTTHINGS_CLIENT_ID=your-smartthings-client-id \
SMARTTHINGS_CLIENT_SECRET=your-smartthings-client-secret \
SMARTTHINGS_ALLOWED_ORIGINS=http://localhost:5174 \
npm run auth:broker
```

For production, deploy the broker behind HTTPS and point `VITE_SMARTTHINGS_BROKER_URL` at that public origin. The current static app can stay static, but GitHub Pages alone is no longer enough for live OAuth because the broker must run somewhere secure.

## Run locally with mock SmartThings data

```bash
npm install
npm run dev
```

Then open `http://localhost:5174/?mock=1` to bypass the token screen and load the built-in fake SmartThings home used for the example screenshots below.

## Run locally with live SmartThings OAuth

```bash
npm install
npm run auth:broker
npm run dev
```

Then open `http://localhost:5174/` and sign in with SmartThings.

## PWA cache reset

If an older installed PWA is stuck on stale assets, this build now performs a one-time service worker and cache reset the first time the updated app loads.

If a client is still trapped on an older worker and will not update, deploy one temporary reset release:

```bash
npm run build:pwa-reset
```

Publish that build once, let affected clients open the app so the old worker unregisters and clears caches, then publish the normal build again:

```bash
npm run build
```

For a manual client-side reset after this change is deployed, open the app with `?reset-pwa=1` once.

## Run in a devcontainer

Open the repository in the included devcontainer to get a ready-to-use Node development environment inside VS Code. The container forwards the Vite dev server on port `5174` and installs dependencies automatically.

## Example screenshots

### Mock home overview

![Mock home overview](./docs/screenshots/mock-home-overview.png)

### Mock room details

![Mock room details](./docs/screenshots/mock-room-details.png)
