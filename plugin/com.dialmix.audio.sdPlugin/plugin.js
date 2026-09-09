const WebSocket = globalThis.WebSocket;
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { argv } = process;
let port = Number(argv[2]);
let host = null;
let contexts = new Map();
let states = new Map();
const api = (path, options = {}) => new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port: 17842, path, ...options, headers: { 'content-type': 'application/json' } }, res => { let body = ''; res.on('data', x => body += x); res.on('end', () => resolve(body ? JSON.parse(body) : null)); }); req.on('error', reject); if (options.body) req.write(options.body); req.end(); });
function startService() { const executable = path.join(__dirname, 'service', 'DialMix.exe'); if (fs.existsSync(executable)) spawn(executable, [], { detached: true, windowsHide: true, stdio: 'ignore' }).unref(); }
function send(event, context, payload = {}) { host.send(JSON.stringify({ event, context, payload })); }
async function update(context, settings) { const target = settings.targetId || 'system'; const value = await api(`/api/audio/targets/${encodeURIComponent(target)}`).catch(() => null); if (!value) return; states.set(context, value); send('setTitle', context, { title: value.muted ? 'MUTED' : `${Math.round(value.volume * 100)}%`, target: 'both' }); }
function change(context, settings, direction) { return api(`/api/audio/targets/${encodeURIComponent(settings.targetId || 'system')}/volume/${direction}`, { method: 'POST', body: JSON.stringify({ step: Number(settings.step) || 5 }) }).then(() => update(context, settings)); }
function connect() { host = new WebSocket(`ws://127.0.0.1:${port}`); host.on('open', () => host.send(JSON.stringify({ event: 'registerPlugin', uuid: 'com.dialmix.audio' }))); host.on('message', raw => { const e = JSON.parse(raw); if (e.event === 'willAppear') { contexts.set(e.context, e.payload.settings || {}); update(e.context, e.payload.settings || {}); } if (e.event === 'didReceiveSettings') { contexts.set(e.context, e.payload.settings); update(e.context, e.payload.settings); } if (e.event === 'dialRotate') { const settings = contexts.get(e.context) || {}; const ticks = Number(e.payload.ticks || e.payload.delta || 1); change(e.context, settings, ticks >= 0 ? 'increase' : 'decrease'); } if (e.event === 'keyDown') { const settings = contexts.get(e.context) || {}; if (settings.pressAction === 'toggleMute') api(`/api/audio/targets/${encodeURIComponent(settings.targetId || 'system')}/mute/toggle`, { method: 'POST' }).then(() => update(e.context, settings)); } }); }
if (!WebSocket) throw new Error('DialMix requires a plugin host with WebSocket support');
api('/api/health').catch(startService);
connect();
