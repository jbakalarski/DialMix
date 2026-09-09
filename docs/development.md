# Development

Prerequisites: Windows 10 or later, .NET 8 SDK or newer, Node.js 20 or newer, and npm.

```powershell
dotnet restore
dotnet build
npm install
npm test
npm run package
```

Run the service with `dotnet run --project src/DialMix`. Open `http://127.0.0.1:17842` for the dashboard. Install `dist/DialMix.streamDeckPlugin` through OpenDeck's plugin manager.

`npm run package` publishes the current Release build of the DialMix service before creating the plugin archive. This keeps the bundled API and property inspector in sync.
