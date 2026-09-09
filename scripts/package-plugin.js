const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'plugin', 'com.dialmix.audio.sdPlugin');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist, { recursive: true });
const staging = path.join(dist, 'com.dialmix.audio.sdPlugin');
fs.cpSync(source, staging, { recursive: true });
const service = path.join(root, 'artifacts', 'DialMix');
if (fs.existsSync(service)) fs.cpSync(service, path.join(staging, 'service'), { recursive: true });
if (process.platform === 'win32') {
  const archive = path.join(dist, 'DialMix.streamDeckPlugin');
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const command = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $source = ${quote(staging)}; $destination = ${quote(archive)}; [System.IO.Compression.ZipFile]::CreateFromDirectory($source, $destination, [System.IO.Compression.CompressionLevel]::Optimal, $true)`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'inherit' });
}
else execFileSync('zip', ['-qr', path.join(dist, 'DialMix.streamDeckPlugin'), 'com.dialmix.audio.sdPlugin'], { cwd: dist });
if (!fs.existsSync(path.join(dist, 'DialMix.streamDeckPlugin'))) throw new Error('Package was not created');
console.log(`Created ${path.join('dist', 'DialMix.streamDeckPlugin')}`);
