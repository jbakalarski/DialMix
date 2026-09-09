# Architecture

DialMix has three boundaries: `WindowsAudioEngine` owns Core Audio/WASAPI access through NAudio; the ASP.NET local service exposes the engine, configuration, and WebSocket events; the OpenDeck plugin handles protocol events and display state. The plugin never calls Windows APIs directly.

Windows endpoint notifications are registered with the Core Audio notification manager. Session and endpoint identifiers are resolved at request time, so disconnected devices and stopped processes are reported instead of crashing the plugin.
