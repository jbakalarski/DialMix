# DialMix

DialMix is an open-source OpenDeck plugin for controlling Windows Core Audio sessions, recording devices, playback devices, and master volume with physical encoders. Changes go through the same Windows audio state used by the native Volume Mixer; no keyboard-volume simulation is used.

## Features

- Per-application, master, input-device, and output-device volume control
- Configurable 1–100% encoder steps with clamping
- Encoder rotation, press-to-mute, and live display state
- Local REST API and WebSocket change events
- Versioned JSON configuration with atomic saves
- Standard Stream Deck package for OpenDeck-compatible hosts
- GitHub release update notifications in the property inspector

## Build and install

Install .NET 8+, Node.js, and npm, then run:

```powershell
dotnet restore
dotnet build
npm install
npm test
npm run package
```

Install `dist/DialMix.streamDeckPlugin` in OpenDeck. Release packages include the published Windows service and start it automatically when the plugin loads. For local development, run `dotnet run --project src/DialMix`. The dashboard and API are at `http://127.0.0.1:17842`.

## Supported hardware

Any OpenDeck/Stream Deck-compatible device exposing the standard Encoder or Keypad controller is supported by the manifest. Redragon Stream Station support depends on its OpenDeck adapter exposing those standard events; no model-specific assumptions are embedded in DialMix.

## Documentation

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [API](docs/api.md)
- [Development](docs/development.md)
- [Troubleshooting](docs/troubleshooting.md)

## License and attribution

DialMix is licensed under the GNU General Public License, version 3.0 (GPL-3.0). See [LICENSE](LICENSE) for the complete license terms.

When distributing a modified version, fork, or derivative work, preserve the original copyright and attribution notices and clearly identify the changes. See [NOTICE](NOTICE) for the required attribution information.
