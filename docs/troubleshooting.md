# Troubleshooting

If no targets appear, confirm that the Windows Audio service is running and that an output device is active. An application must have an active audio session to be exposed by Windows Core Audio.

The OpenDeck inspector starts the bundled DialMix service automatically and retries the target request while the service starts. If the target list is still empty after installing a new package, remove the older plugin installation and install the latest `.streamDeckPlugin` artifact. The service API is available at `http://127.0.0.1:17842/api/audio/targets` and should return the detected Windows audio targets.

The service binds to localhost only. Set `DIALMIX_URL` to another local URL when a different port is required. DialMix does not synthesize keyboard volume events.
