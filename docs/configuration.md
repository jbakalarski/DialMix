# Configuration

Configuration is stored at `%APPDATA%\DialMix\config.json` and has a numeric `version`.

```json
{
  "version": 1,
  "controls": [{ "id": "encoder-1", "target": { "type": "Application", "identifier": "app:1234" }, "step": 5, "pressAction": "ToggleMute" }]
}
```

Steps are clamped to 1–100 percent. Saving is atomic: DialMix writes a temporary file and replaces the previous file only after serialization succeeds.

## Stream Deck feedback

The action property inspector controls the information rendered on the Stream Deck encoder and key:

- icon for the selected target type;
- source name;
- current volume percentage, or `MUTED` when the target is muted;
- volume bar.

All four elements are enabled by default. The icon, source name, volume text, bar fill, bar track, bar border, and background colors can be changed independently with six-digit hexadecimal colors such as `#FFFFFF`. The default foreground color is `#FFFFFF`; the dark track and background provide contrast for the white feedback.
