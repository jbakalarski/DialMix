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

The action property inspector controls the information rendered on the Stream Deck encoder and key. An optional custom target name replaces the source name shown on the device without changing the underlying Windows audio target:

- icon for the selected target type;
- source name;
- current volume percentage, or `MUTED` when the target is muted;
- volume bar.

All four elements are enabled by default. For application targets, `Automatically load application icon` uses the icon embedded in the application's executable. A custom icon can be selected directly from an SVG or PNG file in the property inspector, or supplied as SVG/data URL text. A custom icon overrides the automatic and built-in icons when provided. The icon, source name, volume text, bar fill, bar track, bar border, and background colors can be changed independently with six-digit hexadecimal colors such as `#FFFFFF`. The default foreground color is `#FFFFFF`; the dark track and background provide contrast for the white feedback.
