const WebSocket = globalThis.WebSocket;
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const API_PORT = 17842;
const DEFAULTS = {
  targetId: 'system', targetName: '', step: 5, pressAction: 'toggleMute',
  showIcon: true, showSource: true, showVolume: true, showBar: true,
  autoApplicationIcon: true, customIcon: '',
  iconColor: '#FFFFFF', sourceColor: '#FFFFFF', volumeColor: '#FFFFFF',
  barColor: '#FFFFFF', barBackgroundColor: '#404040', barBorderColor: '#FFFFFF',
  backgroundColor: '#000000'
};
const icons = {
  Application: fs.readFileSync(path.join(__dirname, 'images', 'targets', 'app-window.svg'), 'utf8'),
  ActiveApplication: fs.readFileSync(path.join(__dirname, 'images', 'targets', 'app-window.svg'), 'utf8'),
  InputDevice: fs.readFileSync(path.join(__dirname, 'images', 'targets', 'microphone.svg'), 'utf8'),
  default: fs.readFileSync(path.join(__dirname, 'images', 'targets', 'volume.svg'), 'utf8')
};
function readHostPort(args) {
  for (let index = 2; index < args.length; index += 1) {
    const argument = String(args[index]);
    if (/^-{1,2}port$/i.test(argument)) return Number(args[index + 1]);
    const inline = argument.match(/^-{1,2}port=(\d+)$/i);
    if (inline) return Number(inline[1]);
  }
  const positional = args.slice(2).find(argument => /^\d+$/.test(String(argument)));
  return positional === undefined ? NaN : Number(positional);
}
function readHostArgument(args, name) {
  for (let index = 2; index < args.length; index += 1) {
    const argument = String(args[index]);
    if (new RegExp(`^-{1,2}${name}$`, 'i').test(argument)) return String(args[index + 1] || '');
    const inline = argument.match(new RegExp(`^-{1,2}${name}=(.+)$`, 'i'));
    if (inline) return inline[1];
  }
  return '';
}
const port = readHostPort(process.argv);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DialMix requires a valid OpenDeck WebSocket port argument (-port <number>)');
const PLUGIN_UUID = readHostArgument(process.argv, 'pluginUUID') || 'com.jbakalarski.dialMix.sdPlugin';
let host = null;
const contexts = new Map();
const pendingRotations = new Map();
let servicePromise = null;
const logFile = path.join(__dirname, 'logs', 'dialmix.log');

function log(message, error) {
  const suffix = error ? ` ${error.stack || error.message || error}` : '';
  const line = `[${new Date().toISOString()}] ${message}${suffix}\n`;
  try { fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.appendFileSync(logFile, line); } catch { /* OpenDeck may install the plugin read-only. */ }
  console.error(line.trim());
}

const api = (requestPath, options = {}) => new Promise((resolve, reject) => {
  const request = http.request({ host: '127.0.0.1', port: API_PORT, path: requestPath, ...options, headers: { 'content-type': 'application/json' } }, response => {
    let body = '';
    response.on('data', chunk => body += chunk);
    response.on('end', () => {
      if (response.statusCode >= 400) return reject(new Error(`DialMix API returned HTTP ${response.statusCode}`));
      try { resolve(body ? JSON.parse(body) : null); } catch (error) { reject(error); }
    });
  });
  request.on('error', reject);
  if (options.body) request.write(options.body);
  request.end();
});

function startService() { const executable = path.join(__dirname, 'service', 'DialMix.exe'); if (!fs.existsSync(executable)) throw new Error(`DialMix service executable is missing: ${executable}`); const child = spawn(executable, [], { cwd: path.dirname(executable), detached: true, windowsHide: true, stdio: 'ignore' }); child.on('error', error => log('Failed to start DialMix service.', error)); child.on('exit', (code, signal) => { if (code !== 0) log(`DialMix service exited with code ${code} and signal ${signal || 'none'}.`); }); child.unref(); log(`Started DialMix service from ${path.dirname(executable)}.`); }
async function ensureService() { if (servicePromise) return servicePromise; servicePromise = (async () => { try { await api('/api/health'); log('DialMix service is already running.'); return; } catch (error) { log('DialMix service is unavailable; starting it.', error); startService(); } for (let attempt = 0; attempt < 20; attempt += 1) { try { await api('/api/health'); log('DialMix service became available.'); return; } catch { await new Promise(resolve => setTimeout(resolve, 250)); } } throw new Error('DialMix service did not become available'); })(); try { return await servicePromise; } catch (error) { servicePromise = null; throw error; } }
function color(value, fallback) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value.toUpperCase() : fallback; }
function customIcon(value) { const source = String(value || '').trim(); return source.startsWith('<svg') ? `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}` : source; }
function settings(value = {}) { return { ...DEFAULTS, ...value, targetName: String(value.targetName || '').trim().slice(0, 80), step: Math.max(1, Math.min(100, Number(value.step) || DEFAULTS.step)), customIcon: customIcon(value.customIcon), iconColor: color(value.iconColor, DEFAULTS.iconColor), sourceColor: color(value.sourceColor, DEFAULTS.sourceColor), volumeColor: color(value.volumeColor, DEFAULTS.volumeColor), barColor: color(value.barColor, DEFAULTS.barColor), barBackgroundColor: color(value.barBackgroundColor, DEFAULTS.barBackgroundColor), barBorderColor: color(value.barBorderColor, DEFAULTS.barBorderColor), backgroundColor: color(value.backgroundColor, DEFAULTS.backgroundColor) }; }
function send(event, context, payload = {}) { if (host && host.readyState === WebSocket.OPEN) host.send(JSON.stringify({ event, context, payload })); }
function xml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function fitIcon(source) { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><image href="${xml(source)}" x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet"/></svg>`; return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`; }
function iconSource(target, configured) { const source = configured.customIcon || (configured.autoApplicationIcon && ['Application', 'ActiveApplication'].includes(target.type) && target.icon) || `data:image/svg+xml;base64,${Buffer.from((icons[target.type] || icons.default).replaceAll('currentColor', configured.iconColor)).toString('base64')}`; return fitIcon(source); }
function render(context, target, rawSettings) { const configured = settings(rawSettings); const displayName = configured.targetName || target.name; const percent = Math.round(Math.max(0, Math.min(1, target.volume)) * 100); const volume = target.muted ? 'MUTED' : `${percent}%`; send('setFeedbackLayout', context, { layout: 'layouts/dialmix.json' }); send('setFeedback', context, { icon: { value: iconSource(target, configured), enabled: configured.showIcon }, source: { value: displayName, color: configured.sourceColor, enabled: configured.showSource }, volume: { value: volume, color: configured.volumeColor, enabled: configured.showVolume }, bar: { value: percent, bar_fill_c: configured.barColor, bar_bg_c: configured.barBackgroundColor, bar_border_c: configured.barBorderColor, enabled: configured.showBar } }); send('setTitle', context, { title: configured.showSource ? displayName : volume, target: 'software' }); }
async function update(context, rawSettings) { const configured = settings(rawSettings); try { await ensureService(); const target = await api(`/api/audio/targets/${encodeURIComponent(configured.targetId)}`); if (target) render(context, target, configured); } catch (error) { log(`Unable to update DialMix target ${configured.targetId}.`, error); } }
async function change(context, rawSettings, direction, ticks = 1) {
  const pending = pendingRotations.get(context) || { ticks: 0, running: false };
  pending.ticks += (direction === 'increase' ? 1 : -1) * Math.max(1, Math.abs(Number(ticks) || 1));
  pendingRotations.set(context, pending);
  if (pending.running) return;
  pending.running = true;
  try {
    while (pending.ticks !== 0) {
      const batch = pending.ticks;
      pending.ticks = 0;
      const configured = settings(contexts.get(context)?.settings || rawSettings);
      const direction = batch > 0 ? 'increase' : 'decrease';
      const step = Math.min(100, configured.step * Math.abs(batch));
      const target = await api(`/api/audio/targets/${encodeURIComponent(configured.targetId)}/volume/${direction}`, { method: 'POST', body: JSON.stringify({ step }) });
      if (target) render(context, target, configured);
    }
  } finally {
    pending.running = false;
    if (pending.ticks === 0) pendingRotations.delete(context);
  }
}
async function sendInspectorData(context) { try { await ensureService(); const targets = await api('/api/audio/targets'); log(`Loaded ${targets.length} audio targets for the property inspector.`); send('sendToPropertyInspector', context, { targets, settings: contexts.get(context)?.settings || DEFAULTS }); } catch (error) { log('Unable to load DialMix targets.', error); } }
function handleHostMessage(raw) { try { const message = raw?.data ?? raw; const event = JSON.parse(typeof message === 'string' ? message : Buffer.from(message).toString('utf8')); const payload = event.payload || {}; if (event.event === 'willAppear') { const configured = settings(payload.settings); log(`Action appeared for ${event.context} with target ${configured.targetId}.`); contexts.set(event.context, { settings: configured, controller: payload.controller }); update(event.context, configured); } if (event.event === 'didReceiveSettings') { const current = contexts.get(event.context) || {}; current.settings = settings(payload.settings); contexts.set(event.context, current); log(`Settings received for ${event.context}: ${current.settings.targetId}.`); update(event.context, current.settings); } if (event.event === 'propertyInspectorDidAppear' || event.event === 'getSettings') sendInspectorData(event.context); if (event.event === 'sendToPlugin') { const current = contexts.get(event.context) || {}; current.settings = settings(payload); contexts.set(event.context, current); update(event.context, current.settings); } if (event.event === 'dialRotate') { const current = contexts.get(event.context) || {}; const ticks = Number(payload.ticks || payload.delta || 1); const configured = settings(current.settings); log(`Adjusting ${configured.targetId} by ${ticks} tick(s).`); change(event.context, configured, ticks >= 0 ? 'increase' : 'decrease', ticks).catch(error => log('Unable to change target volume.', error)); } if (event.event === 'dialDown' || event.event === 'keyDown') { const current = contexts.get(event.context) || {}; const configured = settings(current.settings); if (configured.pressAction === 'toggleMute') api(`/api/audio/targets/${encodeURIComponent(configured.targetId)}/mute/toggle`, { method: 'POST' }).then(target => target ? render(event.context, target, configured) : update(event.context, configured)).catch(error => log('Unable to toggle target mute.', error)); } } catch (error) { log('Unable to process an OpenDeck message.', error); } }
function connect() { const url = `ws://127.0.0.1:${port}`; log(`Connecting to OpenDeck at ${url}.`); host = new WebSocket(url); const register = () => { log(`Registering plugin ${PLUGIN_UUID}.`); host.send(JSON.stringify({ event: 'registerPlugin', uuid: PLUGIN_UUID })); ensureService().catch(error => log('Unable to start the DialMix service during plugin startup.', error)); }; if (typeof host.addEventListener === 'function') { host.addEventListener('open', register); host.addEventListener('message', event => handleHostMessage(event.data)); host.addEventListener('error', error => log('OpenDeck WebSocket error.', error)); host.addEventListener('close', () => log('OpenDeck WebSocket closed.')); } else { host.on('open', register); host.on('message', handleHostMessage); host.on('error', error => log('OpenDeck WebSocket error.', error)); host.on('close', () => log('OpenDeck WebSocket closed.')); } }
if (!WebSocket) throw new Error('DialMix requires a plugin host with WebSocket support');
connect();
