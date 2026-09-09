using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using NAudio.Wave;
using System.Drawing;
using System.Drawing.Imaging;
using System.Diagnostics;
using System.IO;

namespace DialMix;

public interface IAudioEngine : IDisposable
{
    event EventHandler<VolumeChange>? Changed;
    IReadOnlyList<AudioTargetInfo> EnumerateTargets();
    AudioTargetInfo? Get(string id);
    void SetVolume(string id, float volume);
    void SetMute(string id, bool muted);
    void ToggleMute(string id);
}

public sealed class WindowsAudioEngine : IAudioEngine
{
    private readonly MMDeviceEnumerator _enumerator = new();
    private readonly Dictionary<string, AudioTargetInfo> _known = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<int, (AudioSessionControl Session, IAudioSessionEventsHandler Handler)> _sessionSubscriptions = [];
    private readonly object _sync = new();
    public event EventHandler<VolumeChange>? Changed;

    public WindowsAudioEngine()
    {
        _enumerator.RegisterEndpointNotificationCallback(new EndpointNotifications(this));
    }

    public IReadOnlyList<AudioTargetInfo> EnumerateTargets()
    {
        var result = new List<AudioTargetInfo>
        {
            ReadEndpoint("system", DataFlow.Render, "System volume")
        };
        foreach (var endpoint in _enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
            result.Add(ReadEndpoint(endpoint.ID, endpoint));
        foreach (var endpoint in _enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active))
            result.Add(ReadEndpoint(endpoint.ID, endpoint));
        foreach (var session in Sessions()) result.Add(session);
        lock (_sync) { _known.Clear(); foreach (var item in result) _known[item.Id] = item; }
        return result;
    }

    public AudioTargetInfo? Get(string id)
    {
        if (id.Equals("system", StringComparison.OrdinalIgnoreCase))
        {
            using var endpoint = _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            return ReadEndpoint(id, endpoint) with { Name = "System volume", Type = TargetType.System };
        }

        if (TryEndpoint(id, out var device))
        {
            using (device) return ReadEndpoint(id, device);
        }

        if (TrySession(id, out var session))
        {
            using (session)
            {
                var pid = (int)session.GetProcessID;
                string name;
                try { name = Process.GetProcessById(pid).ProcessName; } catch { return null; }
                return new AudioTargetInfo($"app:{pid}", name, TargetType.Application, session.SimpleAudioVolume.Volume, session.SimpleAudioVolume.Mute, true, name, ReadApplicationIcon(pid));
            }
        }

        return null;
    }

    public void SetVolume(string id, float volume)
    {
        volume = Math.Clamp(volume, 0, 1);
        if (id.Equals("system", StringComparison.OrdinalIgnoreCase))
        {
            using var endpoint = _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            endpoint.AudioEndpointVolume.MasterVolumeLevelScalar = volume;
            Publish(id, volume, endpoint.AudioEndpointVolume.Mute);
            return;
        }
        if (TryEndpoint(id, out var device)) using (device) { device.AudioEndpointVolume.MasterVolumeLevelScalar = volume; Publish(id, volume, device.AudioEndpointVolume.Mute); return; }
        if (TrySession(id, out var session)) using (session) { session.SimpleAudioVolume.Volume = volume; Publish(id, volume, session.SimpleAudioVolume.Mute); }
    }

    public void SetMute(string id, bool muted)
    {
        if (id.Equals("system", StringComparison.OrdinalIgnoreCase))
        {
            using var endpoint = _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            endpoint.AudioEndpointVolume.Mute = muted; Publish(id, endpoint.AudioEndpointVolume.MasterVolumeLevelScalar, muted); return;
        }
        if (TryEndpoint(id, out var device)) using (device) { device.AudioEndpointVolume.Mute = muted; Publish(id, device.AudioEndpointVolume.MasterVolumeLevelScalar, muted); return; }
        if (TrySession(id, out var session)) using (session) { session.SimpleAudioVolume.Mute = muted; Publish(id, session.SimpleAudioVolume.Volume, muted); }
    }

    public void ToggleMute(string id) { var target = Get(id); if (target is not null) SetMute(id, !target.Muted); }

    private AudioTargetInfo ReadEndpoint(string id, DataFlow flow, string name) { using var endpoint = _enumerator.GetDefaultAudioEndpoint(flow, Role.Multimedia); return ReadEndpoint(id, endpoint) with { Name = name, Type = flow == DataFlow.Capture ? TargetType.InputDevice : TargetType.System }; }
    private static AudioTargetInfo ReadEndpoint(string id, MMDevice endpoint) => new(id, endpoint.FriendlyName, endpoint.DataFlow == DataFlow.Capture ? TargetType.InputDevice : TargetType.OutputDevice, endpoint.AudioEndpointVolume.MasterVolumeLevelScalar, endpoint.AudioEndpointVolume.Mute, endpoint.State == DeviceState.Active);

    private IEnumerable<AudioTargetInfo> Sessions()
    {
        using var endpoint = _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        var sessions = endpoint.AudioSessionManager.Sessions;
        for (var i = 0; i < sessions.Count; i++)
        {
            var session = sessions[i];
            var pid = (int)session.GetProcessID;
            if (pid == 0) continue;
            string name; try { name = Process.GetProcessById(pid).ProcessName; } catch { continue; }
            lock (_sync)
            {
                if (!_sessionSubscriptions.ContainsKey(pid))
                {
                    var handler = new SessionEvents(pid, this);
                    session.RegisterEventClient(handler);
                    _sessionSubscriptions[pid] = (session, handler);
                }
                else
                {
                    session.Dispose();
                    session = _sessionSubscriptions[pid].Session;
                }
            }
            yield return new AudioTargetInfo($"app:{pid}", name, TargetType.Application, session.SimpleAudioVolume.Volume, session.SimpleAudioVolume.Mute, true, name, ReadApplicationIcon(pid));
        }
    }

    private static string? ReadApplicationIcon(int pid)
    {
        try
        {
            var process = Process.GetProcessById(pid);
            var executable = process.MainModule?.FileName;
            if (string.IsNullOrWhiteSpace(executable)) return null;
            using var icon = Icon.ExtractAssociatedIcon(executable);
            using var bitmap = icon?.ToBitmap();
            if (bitmap is null) return null;
            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Png);
            return $"data:image/png;base64,{Convert.ToBase64String(stream.ToArray())}";
        }
        catch { return null; }
    }

    private bool TryEndpoint(string id, out MMDevice endpoint) { endpoint = _enumerator.EnumerateAudioEndPoints(DataFlow.All, DeviceState.Active).FirstOrDefault(x => x.ID.Equals(id, StringComparison.OrdinalIgnoreCase))!; return endpoint is not null; }
    private bool TrySession(string id, out AudioSessionControl session) { session = null!; if (!id.StartsWith("app:", StringComparison.OrdinalIgnoreCase) || !int.TryParse(id[4..], out var pid)) return false; using var endpoint = _enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia); var sessions = endpoint.AudioSessionManager.Sessions; for (var i = 0; i < sessions.Count; i++) if (sessions[i].GetProcessID == pid) { session = sessions[i]; return true; } return false; }
    private void Publish(string id, float volume, bool muted) => Changed?.Invoke(this, new VolumeChange(id, volume, muted));
    public void Dispose() { foreach (var pair in _sessionSubscriptions.Values) { pair.Session.UnRegisterEventClient(pair.Handler); pair.Session.Dispose(); } _sessionSubscriptions.Clear(); _enumerator.Dispose(); }
    private sealed class SessionEvents(int pid, WindowsAudioEngine owner) : IAudioSessionEventsHandler
    {
        public void OnVolumeChanged(float volume, bool isMuted) => owner.Publish($"app:{pid}", volume, isMuted);
        public void OnChannelVolumeChanged(uint channelCount, nint newVolumes, uint channelIndex) { }
        public void OnDisplayNameChanged(string displayName) { }
        public void OnGroupingParamChanged(ref Guid groupingId) { }
        public void OnIconPathChanged(string iconPath) { }
        public void OnSessionDisconnected(AudioSessionDisconnectReason disconnectReason) { }
        public void OnStateChanged(AudioSessionState state) { }
    }
    private sealed class EndpointNotifications(WindowsAudioEngine owner) : IMMNotificationClient { public void OnDeviceStateChanged(string deviceId, DeviceState newState) => owner.Changed?.Invoke(owner, new("system", 0, false)); public void OnDeviceAdded(string pwstrDeviceId) { } public void OnDeviceRemoved(string deviceId) { } public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId) { } public void OnPropertyValueChanged(string pwstrDeviceId, PropertyKey key) { } }
}
