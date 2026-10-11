const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=__dirname;
require('./tools-icons.cjs');
const manifestPath=path.join(root,'extension','manifest.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
fs.copyFileSync(path.join(root,'assets','relay.ico'),path.join(root,'assets','relay-'+manifest.version+'.ico'));
if(!manifest.key) {
  const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  manifest.key=pair.publicKey.export({type:'spki',format:'der'}).toString('base64');
  // Only a public identity is needed for an unpacked extension. No private key is stored.
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}
const digest=crypto.createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32);
const id=[...digest].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
fs.writeFileSync(path.join(root,'extension-id.txt'),id+'\n');
const csc='C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe';
const result=spawnSync(csc,['/nologo','/target:winexe','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll','/win32icon:'+path.join(root,'assets','relay.ico'),'/out:'+path.join(root,'AI互审启动助手.exe'),path.join(root,'launcher','Launcher.cs')],{encoding:'utf8'});
process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
if(result.status!==0)process.exit(result.status||1);
const native=spawnSync(csc,['/nologo','/target:winexe','/codepage:65001','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll','/reference:System.Security.dll','/win32icon:'+path.join(root,'assets','relay.ico'),'/out:'+path.join(root,'AI互审本机核心.exe'),path.join(root,'launcher','NativeCore.cs')],{encoding:'utf8'});process.stdout.write(native.stdout||'');process.stderr.write(native.stderr||'');if(native.status!==0)process.exit(native.status||1);
console.log('Built launcher; extension ID: '+id);
