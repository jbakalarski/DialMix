using System.Text.Json.Serialization;

namespace DialMix;

public enum TargetType { System, Application, InputDevice, OutputDevice, ActiveApplication }
public enum PressAction { None, ToggleMute }

public sealed record AudioTarget(TargetType Type, string? Identifier = null);

public sealed class ControlConfiguration
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "New control";
    public AudioTarget Target { get; set; } = new(TargetType.System);
    public int Step { get; set; } = 5;
    public PressAction PressAction { get; set; } = PressAction.ToggleMute;
    public bool LongPressEnabled { get; set; }
    public bool VisualFeedback { get; set; } = true;
}

public sealed class DialMixConfiguration
{
    public int Version { get; set; } = 1;
    public List<ControlConfiguration> Controls { get; set; } = [];
}

public sealed record AudioTargetInfo(string Id, string Name, TargetType Type, float Volume, bool Muted, bool Available, string? ProcessName = null, string? Icon = null);
public sealed record VolumeChange(string TargetId, float Volume, bool Muted);

public static class VolumeMath
{
    public static int ClampStep(int step) => Math.Clamp(step, 1, 100);
    public static float ApplyStep(float current, int direction, int step) => Math.Clamp(current + (Math.Sign(direction) * ClampStep(step) / 100f), 0f, 1f);
    public static int ToPercent(float volume) => (int)Math.Round(Math.Clamp(volume, 0f, 1f) * 100, MidpointRounding.AwayFromZero);
}
