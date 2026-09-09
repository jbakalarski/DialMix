# Configuration

Configuration is stored at `%APPDATA%\DialMix\config.json` and has a numeric `version`.

```json
{
  "version": 1,
  "controls": [{ "id": "encoder-1", "target": { "type": "Application", "identifier": "app:1234" }, "step": 5, "pressAction": "ToggleMute" }]
}
```

Steps are clamped to 1–100 percent. Saving is atomic: DialMix writes a temporary file and replaces the previous file only after serialization succeeds.
