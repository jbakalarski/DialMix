# Local API

The service listens only on `http://127.0.0.1:17842` by default.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Service status |
| GET | `/api/audio/targets` | List system, applications, inputs, and outputs |
| GET | `/api/audio/targets/{id}` | Read one target |
| PUT | `/api/audio/targets/{id}/volume` | Set `{ "volume": 0..100 }` |
| POST | `/api/audio/targets/{id}/volume/increase` | Increase by `{ "step": n }` |
| POST | `/api/audio/targets/{id}/volume/decrease` | Decrease by `{ "step": n }` |
| PUT | `/api/audio/targets/{id}/mute` | Set `{ "muted": true }` |
| POST | `/api/audio/targets/{id}/mute/toggle` | Toggle mute |
| GET/PUT | `/api/configuration` | Read or replace versioned configuration |
| WebSocket | `/api/events` | Receive `volume_changed` events |

Target IDs are opaque values returned by the list endpoint. Application IDs currently use process IDs and can change when an application restarts.
