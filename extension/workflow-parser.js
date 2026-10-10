'use strict';
importScripts('workflows-data.js','vendor/fflate.min.js');
const W=RelayWorkflowData;
function decoded(bytes){if(bytes[0]===255&&bytes[1]===254)return {text:new TextDecoder('utf-16le').decode(bytes),encoding:'UTF-16LE'};if(bytes[0]===254&&bytes[1]===255)return {text:new TextDecoder('utf-16be').decode(bytes),encoding:'UTF-16BE'};try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),encoding:'UTF-8'};}catch{return {text:new TextDecoder('gb18030',{fatal:true}).decode(bytes),encoding:'GB18030'};}}
function zipBound(bytes){let total=0;fflate.unzipSync(bytes,{filter:f=>{total+=f.originalSize;if(f.originalSize>30*1024*1024||total>60*1024*1024)throw Error('文件解压后的内容过大，请拆分后导入。');return false;}});}
self.onmessage=async({data})=>{try{
  const {name,buffer,kind}=data,bytes=new Uint8Array(buffer);if(!bytes.length||bytes.length>W.limits.file)throw Error('每个导入文件需小于 10 MB，且不能为空。');
  if(kind==='table'){
    if(/\.(csv|tsv)$/i.test(name)){const {text,encoding}=decoded(bytes);self.postMessage({ok:true,result:{sheets:[W.table(W.csv(text),name)],warnings:['文本编码：'+encoding]}});return;}
    if(!/\.xlsx$/i.test(name))throw Error('数据分析支持 CSV、TSV 和 XLSX。');zipBound(bytes);importScripts('vendor/xlsx.full.min.js');
    const book=XLSX.read(bytes,{type:'array',cellDates:true,sheetRows:W.limits.rows+2});if(book.SheetNames.length>20)throw Error('一次最多读取 20 个工作表。');const sheets=[],warnings=[];
    for(const sheetName of book.SheetNames){const sheet=book.Sheets[sheetName];if(!sheet['!ref'])continue;const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);if(range.e.r-range.s.r>W.limits.rows||range.e.c-range.s.c+1>W.limits.cols)throw Error(sheetName+' 超过 5000 行或 100 列，请拆分后导入。');const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true});if(rows.length)sheets.push(W.table(rows,sheetName));if(Object.values(sheet).some(c=>c?.f))warnings.push(sheetName+' 含公式：使用文件中已有的结果，未重新计算公式。');}
    if(!sheets.length)throw Error('没有可读取的工作表。');if(sheets.reduce((n,s)=>n+s.rows.length*s.headers.length,0)>W.limits.cells)throw Error('工作簿超过 10 万个单元格，请拆分后导入。');self.postMessage({ok:true,result:{sheets,warnings}});return;
  }
  if(/\.(txt|md)$/i.test(name)){const result=decoded(bytes);if(result.text.length>W.limits.document)throw Error('资料超过 20 万字符，请拆分后导入。');self.postMessage({ok:true,result:{text:result.text,note:result.encoding}});return;}
  if(/\.docx$/i.test(name)){zipBound(bytes);const files=fflate.unzipSync(bytes,{filter:f=>f.name==='word/document.xml'&&f.originalSize<=5*1024*1024});if(!files['word/document.xml'])throw Error('没有可读取的 Word 正文，或正文超过 5 MB。');self.postMessage({ok:true,result:{xml:new TextDecoder().decode(files['word/document.xml']),note:'Word 正文，不包含批注、页眉和脚注'}});return;}
  if(/\.pdf$/i.test(name)){
    const pdfjs=await import('./vendor/pdfjs/pdf.mjs');const worker=new Worker(new URL('vendor/pdfjs/pdf.worker.mjs',self.location.href),{type:'module'});pdfjs.GlobalWorkerOptions.workerPort=worker;let pdf,loading,result;
    try{loading=pdfjs.getDocument({data:bytes,isEvalSupported:false,useWasm:false,disableFontFace:true,cMapUrl:new URL('vendor/pdfjs/cmaps/',self.location.href).href,cMapPacked:true,standardFontDataUrl:new URL('vendor/pdfjs/standard_fonts/',self.location.href).href});pdf=await loading.promise;if(pdf.numPages>200)throw Error('PDF 最多支持 200 页，请先拆分。');let text='';for(let i=1;i<=pdf.numPages;i++){self.postMessage({progress:`正在读取 PDF：${i}/${pdf.numPages} 页`});const page=await pdf.getPage(i),content=await page.getTextContent();const line=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();if(line)text+=`【第 ${i} 页】\n${line}\n\n`;if(text.length>W.limits.document)throw Error('PDF 文字超过 20 万字符，请拆分后导入。');page.cleanup();}if(!text.trim())throw Error('PDF 没有可提取文字。扫描件请先做文字识别，或粘贴正文。');result={text,note:'PDF 文字层；版式和图片未读取'};}finally{if(loading)await loading.destroy().catch(()=>{});worker.terminate();}self.postMessage({ok:true,result});return;
  }
  throw Error('资料支持 TXT、Markdown、DOCX 和有文字层的 PDF。');
}catch(e){self.postMessage({ok:false,error:e.name==='PasswordException'?'文档有密码，请解密后导入。':e.message||'文件未能读取。'});}};
