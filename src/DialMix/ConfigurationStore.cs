using System.Text.Json;

namespace DialMix;

public sealed class ConfigurationStore
{
    private readonly string _path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DialMix", "config.json");
    private readonly JsonSerializerOptions _options = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public async Task<DialMixConfiguration> LoadAsync(CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        if (!File.Exists(_path)) return new DialMixConfiguration();
        try
        {
            await using var stream = File.OpenRead(_path);
            var configuration = await JsonSerializer.DeserializeAsync<DialMixConfiguration>(stream, _options, cancellationToken);
            return Migrate(configuration ?? new DialMixConfiguration());
        }
        catch (JsonException ex)
        {
            throw new InvalidDataException($"DialMix configuration is invalid: {ex.Message}", ex);
        }
    }

    public async Task SaveAsync(DialMixConfiguration configuration, CancellationToken cancellationToken = default)
    {
        configuration.Version = 1;
        foreach (var control in configuration.Controls) control.Step = VolumeMath.ClampStep(control.Step);
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var temporaryPath = _path + ".tmp";
        await using (var stream = File.Create(temporaryPath)) await JsonSerializer.SerializeAsync(stream, configuration, _options, cancellationToken);
        File.Move(temporaryPath, _path, true);
    }

    private static DialMixConfiguration Migrate(DialMixConfiguration value)
    {
        if (value.Version <= 0) value.Version = 1;
        foreach (var control in value.Controls) control.Step = VolumeMath.ClampStep(control.Step);
        return value;
    }
}
