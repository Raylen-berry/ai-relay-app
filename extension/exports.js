(function(root){
  'use strict';
  const enc=new TextEncoder();
  const xml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
  function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
  function zip(files){
    const chunks=[],entries=[];let offset=0;
    const header=(size)=>{const b=new Uint8Array(size);return [b,new DataView(b.buffer)];};
    for(const [path,text] of Object.entries(files)){
      const name=enc.encode(path),data=enc.encode(text),[h,v]=header(30+name.length),check=crc(data);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,check,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);
      chunks.push(h,data);entries.push({name,size:data.length,check,offset});offset+=h.length+data.length;
    }
    const start=offset;
    for(const e of entries){const [h,v]=header(46+e.name.length);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,e.check,true);v.setUint32(20,e.size,true);v.setUint32(24,e.size,true);v.setUint16(28,e.name.length,true);v.setUint32(42,e.offset,true);h.set(e.name,46);chunks.push(h);offset+=h.length;}
    const [end,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,offset-start,true);v.setUint32(16,start,true);chunks.push(end);const all=new Uint8Array(offset+22);let n=0;for(const chunk of chunks){all.set(chunk,n);n+=chunk.length;}return all;
  }
  function docx(markdown,title='互审结果'){
    const div=document.createElement('div');RelayMarkdown.render(div,markdown);let out='';
    const para=(text,style)=>'<w:p>'+(style?'<w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>':'')+'<w:r>'+(style==='Code'?'<w:rPr><w:rFonts w:ascii="Consolas" w:eastAsia="Microsoft YaHei"/></w:rPr>':'')+String(text).split('\n').map((s,i)=>(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+xml(s)+'</w:t>').join('')+'</w:r></w:p>';
    const content=el=>{const copy=el.cloneNode(true);copy.querySelectorAll('button').forEach(n=>n.remove());copy.querySelectorAll('a[href]').forEach(a=>{if(a.textContent!==a.href)a.textContent+=' ('+a.href+')';});return copy.textContent;};
    const walk=(el)=>{const tag=el.tagName;
      if(tag==='TABLE'){out+='<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(e=>`<w:${e} w:val="single" w:sz="4" w:color="D5DDD6"/>`).join('')+'</w:tblBorders></w:tblPr>';for(const tr of el.querySelectorAll('tr'))out+='<w:tr>'+[...tr.children].map(td=>'<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>'+para(content(td))+'</w:tc>').join('')+'</w:tr>';out+='</w:tbl>';}
      else if(/^H[1-6]$/.test(tag))out+=para(content(el),'Heading'+Math.min(3,Number(tag[1])));
      else if(tag==='PRE')out+=para(content(el),'Code');
      else if(tag==='UL'||tag==='OL'){let i=1;for(const li of el.children)out+=para((tag==='OL'?i++ +'. ':'• ')+content(li));}
      else if(tag==='DIV'||tag==='SECTION'){for(const child of el.children)walk(child);}
      else out+=para(content(el));
    };out+=para(title,'Title');for(const el of div.children)walk(el);
    const ns='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    return zip({'[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels':'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/document.xml':'<?xml version="1.0" encoding="UTF-8"?><w:document '+ns+'><w:body>'+out+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>',
      'word/styles.xml':'<?xml version="1.0"?><w:styles '+ns+'><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+[['Title',36],['Heading1',32],['Heading2',28],['Heading3',24],['Code',20]].map(([s,size])=>`<w:style w:type="paragraph" w:styleId="${s}"><w:name w:val="${s}"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="140"/></w:pPr><w:rPr>${s==='Code'?'':'<w:b/>'}<w:sz w:val="${size}"/></w:rPr></w:style>`).join('')+'</w:styles>'});
  }
  function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function pdf(markdown,title){const id='relayPrint-'+crypto.randomUUID(),data={markdown,title};if(root.chrome?.runtime?.id){await chrome.storage.session.set({[id]:data});await chrome.tabs.create({url:chrome.runtime.getURL('print.html')+'#'+id});}else{localStorage.setItem(id,JSON.stringify(data));window.open('print.html#'+id,'_blank');}}
  root.RelayExports={docx,zip,download,pdf};if(typeof module!=='undefined')module.exports=root.RelayExports;
})(globalThis);
