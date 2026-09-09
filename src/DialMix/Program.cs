using System.Net.WebSockets;
using System.Text.Json;

namespace DialMix;

public static class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("DIALMIX_URL") ?? "http://127.0.0.1:17842");
        builder.Logging.AddSimpleConsole(options => options.SingleLine = true);
        builder.Services.AddSingleton<ConfigurationStore>();
        builder.Services.AddSingleton<IAudioEngine, WindowsAudioEngine>();
        builder.Services.AddSingleton<ChangeHub>();
        var app = builder.Build();
        app.UseDefaultFiles();
        app.UseStaticFiles();
        var engine = app.Services.GetRequiredService<IAudioEngine>();
        var hub = app.Services.GetRequiredService<ChangeHub>();
        engine.Changed += (_, change) => hub.Publish(change);
        app.UseWebSockets();
        app.MapGet("/api/health", () => Results.Ok(new { service = "DialMix", version = 1 }));
        app.MapGet("/api/audio/targets", (IAudioEngine audio) => Results.Ok(audio.EnumerateTargets()));
        app.MapGet("/api/audio/targets/{id}", (string id, IAudioEngine audio) => audio.Get(id) is { } target ? Results.Ok(target) : Results.NotFound());
        app.MapPut("/api/audio/targets/{id}/volume", async (string id, VolumeRequest request, IAudioEngine audio) => { if (request.Volume is < 0 or > 100) return Results.BadRequest(new { error = "volume must be between 0 and 100" }); audio.SetVolume(id, request.Volume / 100f); await Task.CompletedTask; return Results.Ok(audio.Get(id)); });
        app.MapPost("/api/audio/targets/{id}/volume/increase", (string id, StepRequest? request, IAudioEngine audio) => ChangeVolume(id, request?.Step ?? 5, audio));
        app.MapPost("/api/audio/targets/{id}/volume/decrease", (string id, StepRequest? request, IAudioEngine audio) => ChangeVolume(id, -(request?.Step ?? 5), audio));
        app.MapPut("/api/audio/targets/{id}/mute", (string id, MuteRequest request, IAudioEngine audio) => { audio.SetMute(id, request.Muted); return audio.Get(id) is { } value ? Results.Ok(value) : Results.NotFound(); });
        app.MapPost("/api/audio/targets/{id}/mute/toggle", (string id, IAudioEngine audio) => { audio.ToggleMute(id); return audio.Get(id) is { } value ? Results.Ok(value) : Results.NotFound(); });
        app.MapGet("/api/configuration", async (ConfigurationStore store, CancellationToken ct) => Results.Ok(await store.LoadAsync(ct)));
        app.MapPut("/api/configuration", async (DialMixConfiguration value, ConfigurationStore store, CancellationToken ct) => { await store.SaveAsync(value, ct); return Results.Ok(value); });
        app.Map("/api/events", async (HttpContext context, ChangeHub changes) => { if (!context.WebSockets.IsWebSocketRequest) return Results.BadRequest("WebSocket upgrade required"); using var socket = await context.WebSockets.AcceptWebSocketAsync(); await changes.Subscribe(socket, context.RequestAborted); return Results.Empty; });
        await app.RunAsync();
    }

    private static IResult ChangeVolume(string id, int step, IAudioEngine audio) { var target = audio.Get(id); if (target is null) return Results.NotFound(); audio.SetVolume(id, VolumeMath.ApplyStep(target.Volume, Math.Sign(step), Math.Abs(step))); return Results.Ok(audio.Get(id)); }
}

public sealed record VolumeRequest(int Volume);
public sealed record StepRequest(int Step);
public sealed record MuteRequest(bool Muted);

public sealed class ChangeHub
{
    private readonly HashSet<WebSocket> _sockets = [];
    private readonly object _gate = new();
    public void Publish(VolumeChange change) { var payload = JsonSerializer.SerializeToUtf8Bytes(new { @event = "volume_changed", target = change.TargetId, volume = VolumeMath.ToPercent(change.Volume), muted = change.Muted }); lock (_gate) foreach (var socket in _sockets.Where(x => x.State == WebSocketState.Open).ToArray()) _ = socket.SendAsync(payload, WebSocketMessageType.Text, true, CancellationToken.None); }
    public async Task Subscribe(WebSocket socket, CancellationToken ct) { lock (_gate) _sockets.Add(socket); var buffer = new byte[256]; try { while (socket.State == WebSocketState.Open && !ct.IsCancellationRequested) await socket.ReceiveAsync(buffer, ct); } catch (OperationCanceledException) { } finally { lock (_gate) _sockets.Remove(socket); if (socket.State == WebSocketState.Open) await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None); } }
}
