const fs=require('node:fs'),path=require('node:path');
const {Resvg}=require('@resvg/resvg-js');
const root=__dirname;
// One editable vector source keeps the small browser and Windows icons crisp.
const svg=fs.readFileSync(path.join(root,'assets/relay-icon.svg'),'utf8');
const sizes=[16,24,32,48,64,128,256,512];
const images=[];
for(const size of sizes){
  const png=new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();
  fs.writeFileSync(path.join(root,'assets','relay-'+size+'.png'),png);
  if(size<=256)images.push({size,png});
  if([16,32,48,128].includes(size))fs.writeFileSync(path.join(root,'extension','icon-'+size+'.png'),png);
  if(size===128)fs.writeFileSync(path.join(root,'extension/icon.png'),png);
}
fs.copyFileSync(path.join(root,'assets/relay-128.png'),path.join(root,'extension/brand.png'));
// Windows Vista+ ICO frames can embed PNGs, retaining alpha at all sizes.
const header=Buffer.alloc(6+images.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);
let offset=header.length;
images.forEach(({size,png},i)=>{const p=6+i*16;header[p]=header[p+1]=size===256?0:size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length;});
fs.writeFileSync(path.join(root,'assets/relay.ico'),Buffer.concat([header,...images.map(i=>i.png)]));
console.log('Generated 8 PNG sizes, workbench branding and 7-frame Windows ICO from the line icon SVG.');
