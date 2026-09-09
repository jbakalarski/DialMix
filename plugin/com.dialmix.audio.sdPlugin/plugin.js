const WebSocket = globalThis.WebSocket;
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const API_PORT = 17842;
const DEFAULTS = {
  targetId: 'system', step: 5, pressAction: 'toggleMute',
  showIcon: true, showSource: true, showVolume: true, showBar: true,
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
const PLUGIN_UUID = readHostArgument(process.argv, 'pluginUUID') || 'com.dialmix.audio.sdPlugin';
let host = null;
const contexts = new Map();
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
function settings(value = {}) { return { ...DEFAULTS, ...value, step: Math.max(1, Math.min(100, Number(value.step) || DEFAULTS.step)), iconColor: color(value.iconColor, DEFAULTS.iconColor), sourceColor: color(value.sourceColor, DEFAULTS.sourceColor), volumeColor: color(value.volumeColor, DEFAULTS.volumeColor), barColor: color(value.barColor, DEFAULTS.barColor), barBackgroundColor: color(value.barBackgroundColor, DEFAULTS.barBackgroundColor), barBorderColor: color(value.barBorderColor, DEFAULTS.barBorderColor), backgroundColor: color(value.backgroundColor, DEFAULTS.backgroundColor) }; }
function send(event, context, payload = {}) { if (host && host.readyState === WebSocket.OPEN) host.send(JSON.stringify({ event, context, payload })); }
function iconData(type, iconColor) { const source = (icons[type] || icons.default).replaceAll('currentColor', iconColor); return `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`; }
function xml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function iconInner(type, iconColor) { return (icons[type] || icons.default).replace(/<svg[^>]*>/, '').replace('</svg>', '').replaceAll('currentColor', iconColor); }
function keypadImage(target, value, configured) { const percent = Math.round(Math.max(0, Math.min(1, value.volume)) * 100); const source = target.muted ? 'MUTED' : `${percent}%`; const icon = iconInner(target.type, configured.iconColor); const iconMarkup = configured.showIcon ? `<g transform="translate(58 8) scale(2.1)">${icon}</g>` : ''; const sourceMarkup = configured.showSource ? `<text x="72" y="72" fill="${configured.sourceColor}" font-size="13" font-family="Arial" text-anchor="middle">${xml(target.name)}</text>` : ''; const volumeMarkup = configured.showVolume ? `<text x="72" y="101" fill="${configured.volumeColor}" font-size="22" font-family="Arial" font-weight="700" text-anchor="middle">${source}</text>` : ''; const barMarkup = configured.showBar ? `<rect x="12" y="120" width="120" height="10" rx="4" fill="${configured.barBackgroundColor}"/><rect x="12" y="120" width="${1.2 * percent}" height="10" rx="4" fill="${configured.barColor}"/>` : ''; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="${configured.backgroundColor}"/>${iconMarkup}${sourceMarkup}${volumeMarkup}${barMarkup}</svg>`; return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`; }
function render(context, target, rawSettings) { const configured = settings(rawSettings); const percent = Math.round(Math.max(0, Math.min(1, target.volume)) * 100); const volume = target.muted ? 'MUTED' : `${percent}%`; send('setFeedbackLayout', context, { layout: 'layouts/dialmix.json' }); send('setFeedback', context, { icon: { value: iconData(target.type, configured.iconColor), enabled: configured.showIcon }, source: { value: target.name, color: configured.sourceColor, enabled: configured.showSource }, volume: { value: volume, color: configured.volumeColor, enabled: configured.showVolume }, bar: { value: percent, bar_fill_c: configured.barColor, bar_bg_c: configured.barBackgroundColor, bar_border_c: configured.barBorderColor, enabled: configured.showBar } }); send('setImage', context, { image: keypadImage(target, target, configured), target: 'both' }); send('setTitle', context, { title: configured.showSource ? target.name : volume, target: 'software' }); }
async function update(context, rawSettings) { const configured = settings(rawSettings); try { await ensureService(); const target = await api(`/api/audio/targets/${encodeURIComponent(configured.targetId)}`); if (target) render(context, target, configured); } catch (error) { log(`Unable to update DialMix target ${configured.targetId}.`, error); } }
async function change(context, rawSettings, direction) { const configured = settings(rawSettings); await api(`/api/audio/targets/${encodeURIComponent(configured.targetId)}/volume/${direction}`, { method: 'POST', body: JSON.stringify({ step: configured.step }) }); await update(context, configured); }
async function sendInspectorData(context) { try { await ensureService(); const targets = await api('/api/audio/targets'); log(`Loaded ${targets.length} audio targets for the property inspector.`); send('sendToPropertyInspector', context, { targets, settings: contexts.get(context)?.settings || DEFAULTS }); } catch (error) { log('Unable to load DialMix targets.', error); } }
function handleHostMessage(raw) { const message = raw?.data ?? raw; const event = JSON.parse(typeof message === 'string' ? message : Buffer.from(message).toString('utf8')); const payload = event.payload || {}; if (event.event === 'willAppear') { const configured = settings(payload.settings); log(`Action appeared for ${event.context} with target ${configured.targetId}.`); contexts.set(event.context, { settings: configured, controller: payload.controller }); update(event.context, configured); } if (event.event === 'didReceiveSettings') { const current = contexts.get(event.context) || {}; current.settings = settings(payload.settings); contexts.set(event.context, current); log(`Settings received for ${event.context}: ${current.settings.targetId}.`); update(event.context, current.settings); } if (event.event === 'propertyInspectorDidAppear' || event.event === 'getSettings') sendInspectorData(event.context); if (event.event === 'sendToPlugin') { const current = contexts.get(event.context) || {}; current.settings = settings(payload); contexts.set(event.context, current); update(event.context, current.settings); } if (event.event === 'dialRotate') { const current = contexts.get(event.context) || {}; const ticks = Number(payload.ticks || payload.delta || 1); const configured = settings(current.settings); log(`Adjusting ${configured.targetId} by ${ticks} tick(s).`); change(event.context, configured, ticks >= 0 ? 'increase' : 'decrease').catch(error => log('Unable to change target volume.', error)); } if (event.event === 'dialDown' || event.event === 'keyDown') { const current = contexts.get(event.context) || {}; const configured = settings(current.settings); if (configured.pressAction === 'toggleMute') api(`/api/audio/targets/${encodeURIComponent(configured.targetId)}/mute/toggle`, { method: 'POST' }).then(() => update(event.context, configured)).catch(error => log('Unable to toggle target mute.', error)); } }
function connect() { const url = `ws://127.0.0.1:${port}`; log(`Connecting to OpenDeck at ${url}.`); host = new WebSocket(url); const register = () => { log(`Registering plugin ${PLUGIN_UUID}.`); host.send(JSON.stringify({ event: 'registerPlugin', uuid: PLUGIN_UUID })); ensureService().catch(error => log('Unable to start the DialMix service during plugin startup.', error)); }; if (typeof host.addEventListener === 'function') { host.addEventListener('open', register); host.addEventListener('message', event => handleHostMessage(event.data)); host.addEventListener('error', error => log('OpenDeck WebSocket error.', error)); host.addEventListener('close', () => log('OpenDeck WebSocket closed.')); } else { host.on('open', register); host.on('message', handleHostMessage); host.on('error', error => log('OpenDeck WebSocket error.', error)); host.on('close', () => log('OpenDeck WebSocket closed.')); } }
if (!WebSocket) throw new Error('DialMix requires a plugin host with WebSocket support');
connect();
