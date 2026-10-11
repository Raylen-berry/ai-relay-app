'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const dir = path.join(__dirname, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, require('./package.json').version);
for(const permission of manifest.optional_host_permissions||[])assert.ok(!(manifest.host_permissions||[]).includes(permission),'Redundant optional host permission: '+permission);
const lock = require('./package-lock.json');
assert.equal(lock.version, manifest.version);
assert.equal(lock.packages[''].version, manifest.version);
assert.ok(fs.existsSync(path.join(__dirname,'assets','relay-'+manifest.version+'.ico')),'Missing versioned Windows shortcut icon');
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  new vm.Script(fs.readFileSync(path.join(dir, file), 'utf8'), {filename: file});
}
const html = fs.readFileSync(path.join(dir, 'app.html'), 'utf8');
const uiScripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
const contentScripts = manifest.content_scripts.flatMap(s => s.js);
const uiStyles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(match => match[1]);
for (const file of [...uiScripts, ...uiStyles, ...contentScripts, ...Object.values(manifest.icons), manifest.background.service_worker]) {
  assert.ok(fs.existsSync(path.join(dir, file)), 'Missing packaged file: ' + file);
}
assert.ok(uiScripts.indexOf('editor.js') < uiScripts.indexOf('engine.js'));
assert.ok(uiScripts.indexOf('layout.js') >= 0 && uiScripts.indexOf('layout.js') < uiScripts.indexOf('app.js'));
assert.ok(uiScripts.indexOf('files.js') >= 0 && uiScripts.indexOf('files.js') < uiScripts.indexOf('app.js'));
assert.ok(fs.existsSync(path.join(dir,'brand.png')));
assert.ok(contentScripts.indexOf('editor.js') < contentScripts.indexOf('content.js'));
assert.ok(contentScripts.indexOf('upload.js') >= 0 && contentScripts.indexOf('upload.js') < contentScripts.indexOf('content.js'));
for(const file of ['open.html','open.js'])assert.ok(fs.existsSync(path.join(dir,file)));
assert.ok(html.includes('Relay ' + manifest.version));
console.log('Verified extension syntax, script order, referenced files and version ' + manifest.version);
