# SmartHue 0.1
SmartThings but with the Philips HUE experience; this repository tries to replicate a smooth philips hue apperance, function and philosophy for lights i smartthings. 

It has one focus; to be the most enjoyable "daily-driver" app for smartthings. 

# Supported features
- List rooms
- List lights 
- Room Precense
- Room humidity and temperature (aggregated value, if multiple)
- Dim lights 
- Turn on / off lights
- Hide rooms locally on device

# Good to know
- Devices that are "offline" wont show up in smarthue.

## SmartThings OAuth login

The app now uses SmartThings OAuth instead of Personal Access Tokens. SmartThings access tokens still expire, but the app stores the returned refresh token and renews the session automatically.

Because SmartThings requires a `client_secret`, the browser app cannot complete the OAuth code exchange on its own. A small broker is included in this repo for the code exchange and refresh steps.

The login flow now uses a relay session that is safe for installed PWAs on mobile:

- the app calls `/auth/start` on the broker and gets back a SmartThings authorization URL
- SmartThings redirects back to the broker callback at `/auth/callback`
- the broker exchanges the code server-side and stores the result in a short-lived pending session
- the app resumes by polling `/auth/status/:sessionId` until the session completes or fails

If no OAuth frontend env is configured, the app falls back to the legacy Personal Access Token screen.

### 1. Create a SmartThings OAuth app

Create an OAuth-In SmartApp with the SmartThings CLI and register the redirect URI for your deployed app URL.

You will need:

- a `client_id`
- a `client_secret`
- scopes that cover this app's reads and commands, and prepare scene access for later, for example `r:locations:* r:devices:* x:devices:* r:scenes:* x:scenes:*`

### 2. Configure the frontend

Create a local `.env` file from `.env.example` and set these values:

```bash
VITE_SMARTTHINGS_BROKER_URL=https://your-broker.vercel.app
VITE_SMARTTHINGS_SCOPES=r:locations:* r:devices:* x:devices:* r:scenes:* x:scenes:*
```

For a GitHub Pages frontend with a separate Vercel broker, point `VITE_SMARTTHINGS_BROKER_URL` at the Vercel project origin. For local development, override it to `http://localhost:8787` and run the standalone broker with `npm run auth:broker`.

### 3. Configure and run the OAuth broker

The broker exchanges the authorization code and refresh token with SmartThings while keeping the `client_secret` out of the browser.

For Vercel, the broker can run in a dedicated project by setting the project Root Directory to `api/`.

This repository keeps the function files in `api/api/` for Vercel's project-local function convention, and `api/vercel.json` rewrites the public routes so the deployed broker still lives at the origin root:

Set these environment variables in Vercel:

```bash
SMARTTHINGS_CLIENT_ID=your-smartthings-client-id
SMARTTHINGS_CLIENT_SECRET=your-smartthings-client-secret
SMARTTHINGS_ALLOWED_ORIGINS=https://your-github-pages-domain.com
SMARTTHINGS_TOKEN_URL=https://api.smartthings.com/oauth/token
KV_REST_API_URL=https://your-upstash-rest-url
KV_REST_API_TOKEN=your-upstash-rest-token
```

You can also use `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` instead of the `KV_*` names. Local development falls back to in-memory relay storage automatically, but production needs durable storage so callback and poll requests can land on different serverless instances.

The app will then use:

- `https://your-broker.vercel.app/auth/start`
- `https://your-broker.vercel.app/auth/callback`
- `https://your-broker.vercel.app/auth/status/:sessionId`
- `https://your-broker.vercel.app/smartthings/exchange`
- `https://your-broker.vercel.app/smartthings/refresh`
- `https://your-broker.vercel.app/health`

If you connect Vercel directly to this repo only to host the broker, that is fine.

For SmartThings OAuth, register the broker callback URL as the redirect URI, for example:

```bash
https://your-broker.vercel.app/auth/callback
```

```bash
SMARTTHINGS_CLIENT_ID=your-smartthings-client-id \
SMARTTHINGS_CLIENT_SECRET=your-smartthings-client-secret \
SMARTTHINGS_ALLOWED_ORIGINS=http://localhost:5174 \
npm run auth:broker
```

For your production setup, GitHub Pages can host the frontend and Vercel can host only the broker functions. GitHub Pages alone is still not enough for live OAuth because the broker must run somewhere secure.

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
