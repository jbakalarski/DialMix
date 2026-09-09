# Troubleshooting

If no targets appear, confirm that the Windows Audio service is running and that an output device is active. An application must have an active audio session to be exposed by Windows Core Audio.

The service binds to localhost only. Set `DIALMIX_URL` to another local URL when a different port is required. DialMix does not synthesize keyboard volume events.
