# smartthings-hue
SmartThings but with the Philips HUE experience

## Run locally with mock SmartThings data

```bash
npm install
npm run dev
```

Then open `http://localhost:5174/?mock=1` to bypass the token screen and load the built-in fake SmartThings home used for the example screenshots below.

## Run in a devcontainer

Open the repository in the included devcontainer to get a ready-to-use Node development environment inside VS Code. The container forwards the Vite dev server on port `5174` and installs dependencies automatically.

## Example screenshots

### Mock home overview

![Mock home overview](./docs/screenshots/mock-home-overview.png)

### Mock room details

![Mock room details](./docs/screenshots/mock-room-details.png)
