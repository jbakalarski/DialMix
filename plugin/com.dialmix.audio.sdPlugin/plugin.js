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
async function ensureService() { try { await api('/api/health'); return; } catch { startService(); } for (let attempt = 0; attempt < 20; attempt += 1) { try { await api('/api/health'); return; } catch { await new Promise(resolve => setTimeout(resolve, 250)); } } throw new Error('DialMix service did not become available'); }
function send(event, context, payload = {}) { if (host && host.readyState === WebSocket.OPEN) host.send(JSON.stringify({ event, context, payload })); }
async function update(context, settings) { const target = settings.targetId || 'system'; try { await ensureService(); const value = await api(`/api/audio/targets/${encodeURIComponent(target)}`); if (!value) return; states.set(context, value); send('setTitle', context, { title: value.muted ? 'MUTED' : `${Math.round(value.volume * 100)}%`, target: 'both' }); } catch (error) { console.error('Unable to update DialMix target:', error.message); } }
function change(context, settings, direction) { return api(`/api/audio/targets/${encodeURIComponent(settings.targetId || 'system')}/volume/${direction}`, { method: 'POST', body: JSON.stringify({ step: Number(settings.step) || 5 }) }).then(() => update(context, settings)); }
function handleHostMessage(raw) {
  const message = raw?.data ?? raw;
  const e = JSON.parse(typeof message === 'string' ? message : Buffer.from(message).toString('utf8'));
  if (e.event === 'willAppear') { contexts.set(e.context, e.payload.settings || {}); update(e.context, e.payload.settings || {}); }
  if (e.event === 'didReceiveSettings') { contexts.set(e.context, e.payload.settings || {}); update(e.context, e.payload.settings || {}); }
  if (e.event === 'dialRotate') { const settings = contexts.get(e.context) || {}; const ticks = Number(e.payload.ticks || e.payload.delta || 1); change(e.context, settings, ticks >= 0 ? 'increase' : 'decrease'); }
  if (e.event === 'keyDown') { const settings = contexts.get(e.context) || {}; if (settings.pressAction === 'toggleMute') api(`/api/audio/targets/${encodeURIComponent(settings.targetId || 'system')}/mute/toggle`, { method: 'POST' }).then(() => update(e.context, settings)).catch(error => console.error('Unable to toggle DialMix mute:', error.message)); }
}
function connect() {
  host = new WebSocket(`ws://127.0.0.1:${port}`);
  const register = () => host.send(JSON.stringify({ event: 'registerPlugin', uuid: 'com.dialmix.audio' }));
  if (typeof host.addEventListener === 'function') {
    host.addEventListener('open', register);
    host.addEventListener('message', event => handleHostMessage(event.data));
    host.addEventListener('error', error => console.error('OpenDeck connection error:', error.message || error));
  } else {
    host.on('open', register);
    host.on('message', handleHostMessage);
  }
}
if (!WebSocket) throw new Error('DialMix requires a plugin host with WebSocket support');
connect();
