(function(){
  'use strict';const $=id=>document.getElementById(id),D=window.RelayDeliveryData;
  const source='A 商品 2 件，每件 19.90 元；B 商品 3 件，每件 12.50 元。运费 8.00 元，优惠减 5.00 元，无其他税费。';
  const question='核对这份模拟订单的应付金额，列出算式。\n\n[S1:P1] '+source+'\n\n写出“应付金额：xx.xx 元”，并引用题面编号。';
  const result='A 商品：2 × 19.90 = 39.80 元\nB 商品：3 × 12.50 = 37.50 元\n\n商品合计：77.30 元\n应付金额：77.30 + 8.00 − 5.00 = **80.30 元** [S1:P1]';
  const criteria=['A、B 商品金额分别计算准确','包含运费和优惠','应付金额为 80.30 元，并显示算式'];
  const text=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;return n;};
  const val=(id,v)=>{if($(id)&&$(id).value!==v)$(id).value=v;};
  function review(received,referenceSaved,checked,supported){
    const refs=referenceSaved?[{id:'S1:P1',title:'模拟订单',label:'手动提供的原文',text:source,url:''}]:[];
    const workflow=referenceSaved?{kind:'research',sourceRefs:refs,scope:{documents:1,totalChunks:1,selectedChunks:1,suppliedChars:source.length,partial:true,method:'用户手动提供的原文快照'}}:undefined;
    const delivery=D.settings({requirements:criteria,accepted:criteria.slice(0,checked),purpose:'核对模拟订单金额',format:'算式与应付金额'});
    const run={finalOut:result,delivery,workflow,deliveryOrigin:{kind:'relay'}};
    if(supported&&referenceSaved){const c=D.claims(result,workflow)[0];delivery.checks=[{text:c.text,evidence:c.evidence,status:'supported'}];}
    const a=D.assessment(run);$('deliveryBadge').textContent=received?a.label:'等待成果';$('deliveryBadge').classList.toggle('problem',received&&!!a.contradicted);
    $('deliveryResult').hidden=!received;
    const summary=$('deliverySummary');summary.replaceChildren(text('span',D.scopeText(workflow)),text('span','待核对 '+a.pending+' 项；证据问题 '+a.contradicted+' 项。没有引用的表述也可能需要核查。'));
    const acceptance=$('deliveryAcceptance');acceptance.replaceChildren();criteria.forEach((c,i)=>{const li=text('li'),label=text('label'),input=text('input');input.type='checkbox';input.checked=i<checked;input.id='demoCriterion'+i;label.append(input,text('span',c));li.append(label);acceptance.append(li);});
    const claims=$('deliveryClaims');claims.replaceChildren();a.items.forEach(c=>{const li=text('li');li.append(text('p',c.text));const details=text('details');details.open=supported;details.append(text('summary','查看本次提供的原文'),text('blockquote',referenceSaved?'[S1:P1] 模拟订单 · 手动提供的原文\n'+source:'本次没有提供这个编号。'));li.append(details);const row=text('div');row.className='delivery-check-row';const select=text('select');select.id='demoEvidenceSelect';for(const [v,label]of [['pending','待核对'],['supported','这句话有依据'],['contradicted','证据不符'],['uncertain','无法确认']]){const o=text('option',label);o.value=v;select.append(o);}select.value=supported?'supported':'pending';select.disabled=!referenceSaved;const note=text('input');note.placeholder='核对说明（可选）';note.value=supported?'算式与题面金额一致':'';row.append(select,note);li.append(row);if(!referenceSaved){const p=text('p','编号不存在，不能标记为有依据。');p.className='delivery-note';li.append(p);}claims.append(li);});
    const list=$('deskReferences');list.replaceChildren();if(referenceSaved){const li=text('li'),d=text('details');d.append(text('summary','[S1:P1] 模拟订单'),text('blockquote',source));li.append(d);list.append(li);}
  }
  function rect(selector){const el=document.querySelector(selector);return el?.getBoundingClientRect();}
  function focus(selector,phase,click=false){const el=document.querySelector(selector);if(!el)return;el.classList.add('tutorial-focus');const r=el.getBoundingClientRect(),x=r.left+Math.min(r.width*.68,r.width-12),y=r.top+Math.min(r.height*.65,r.height-6),pointer=$('tutorialPointer');pointer.style.left=x+'px';pointer.style.top=y+'px';const ring=pointer.querySelector('i');const wave=phase%2.3;ring.style.transform='scale('+(click&&wave<.7?.5+wave:0)+')';ring.style.opacity=click&&wave<.7?1-wave/.7:0;if(click&&wave<.5)el.classList.add('demo-click');}
  function scroll(selector,offset=24){const r=rect(selector);if(!r)return;window.scrollTo(0,Math.max(0,r.top+window.scrollY-offset));}
  function apply(chapter,local,duration){
    const received=chapter>5||(chapter===5&&local>=2.5),taskDone=chapter>4||(chapter===4&&local>=11),referenceSaved=chapter>6||(chapter===6&&local>=5.5),checked=chapter>6?3:chapter===6?local>=12.5?3:local>=10.5?2:local>=8.5?1:0:0,supported=chapter>6||(chapter===6&&local>=17);
    document.querySelectorAll('.tutorial-focus,.demo-click').forEach(n=>n.classList.remove('tutorial-focus','demo-click'));
    $('modeBadge').textContent='本机保存';$('taskWorkspace').hidden=received;$('deliveryWorkspace').hidden=!received;$('navTasks').setAttribute('aria-pressed',String(!received));$('navDelivery').setAttribute('aria-pressed',String(received));
    val('question',chapter===0?'':chapter===1?question.slice(0,Math.floor(question.length*Math.min(1,Math.max(0,(local-1)/5)))):question);val('primary','deepseek');val('reviewer','chatgpt');val('sequence',chapter>=2?'1-2-1':'1');val('deliveryMode',chapter>=2?'draft':'single');
    $('charCount').textContent=$('question').value.length+' 字';$('viewPreview').setAttribute('aria-pressed','true');$('viewRaw').setAttribute('aria-pressed','false');$('thirdField').classList.add('unused');$('third').disabled=true;document.querySelectorAll('.route-preset').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.route===$('sequence').value)));
    val('deliveryRequirements',chapter===3?criteria.join('\n').slice(0,Math.floor(criteria.join('\n').length*Math.min(1,Math.max(0,(local-3)/5)))):chapter>3?criteria.join('\n'):'');val('deliveryPurpose',chapter>=3?'核对模拟订单金额':'');val('deliveryFormat',chapter>=3?'算式与应付金额':'');
    document.querySelector('.task-requirements').open=chapter===3;
    $('start').disabled=chapter===4&&local>=1&&!taskDone;$('start').textContent=taskDone?'开始新任务':'开始互审';$('pause').disabled=chapter!==4||local<1||taskDone;$('resume').disabled=true;$('takeover').disabled=chapter!==4||taskDone;
    $('sendToDelivery').disabled=!taskDone;$('copyFinal').disabled=!taskDone;$('resultLabel').textContent=taskDone?'已完成':'等待开始';$('finalOut').hidden=true;$('resultPreview').hidden=false;RelayMarkdown.render($('resultPreview'),taskDone?result:'');
    const current=chapter===4?(local<4?0:local<8?1:local<11?2:3):chapter>4?3:0,steps=$('steps');steps.replaceChildren();const labels=chapter<2?['DeepSeek · 生成成果']:['DeepSeek · 起草','ChatGPT · 审核','DeepSeek · 定稿'];labels.forEach((v,i)=>{const n=text('span',v);n.className=i<current?'complete':i===current&&chapter>=4?'active':'';steps.append(n);if(i<labels.length-1)steps.append(text('i','→'));});
    $('status').textContent=taskDone?'成果已保存，可送到成果交付核对':chapter===4&&local>=1?'正在处理第 '+(current+1)+' / 3 轮 · '+['DeepSeek 起草','ChatGPT 审核','DeepSeek 定稿'][Math.min(current,2)]:'就绪 · 输入问题后，点击“开始互审”';
    $('deskEmpty').hidden=received;$('deskEditor').hidden=!received;$('deskBusy').hidden=true;$('deskCount').textContent=received?'1 / 50 份':'0 / 50 份';$('deskReceiveHistory').disabled=true;$('deskReceive').disabled=!taskDone;
    const select=$('deskSelect');select.replaceChildren(text('option','模拟订单核对'));val('deskTitle','模拟订单核对');val('deskBody',result);val('deskPurpose','核对模拟订单金额');val('deskFormat','算式与应付金额');val('deskRequirements',criteria.join('\n'));
    $('deskOrigin').textContent='AI 互审成果 · 独立副本';$('deskStatus').textContent=received?'成果和核对记录已保存在本机。':'';$('deskPreviewBody').hidden=true;
    document.querySelector('.desk-evidence').open=chapter===6&&local<7;val('deskRefId','S1:P1');val('deskRefTitle','模拟订单');val('deskRefBody',chapter===6&&local<5.5?source.slice(0,Math.floor(source.length*Math.min(1,local/3.7))):'');
    review(received,referenceSaved,checked,supported);
    let anchor='header',target='#navTasks',click=false;
    if(chapter===0){window.scrollTo(0,0);target=local<5?'#navTasks':'#navDelivery';}
    if(chapter===1){anchor='#workspace';scroll(anchor,25);target='#question';}
    if(chapter===2){scroll('.route-card',32);target=local<5?'#primary':local<9?'#reviewer':'#sequence';click=true;}
    if(chapter===3){scroll('.task-requirements',24);target=local<3?'.task-requirements > summary':'#deliveryRequirements';click=local<3;}
    if(chapter===4){scroll('#workspace',22);target=local<2?'#start':local<11?'#steps':local<15?'#resultPreview':'#status';click=local<2;}
    if(chapter===5){if(!received){scroll('#workspace',22);target='#sendToDelivery';click=true;}else if(local<9){scroll('#deskTitle',120);target=local<6?'#deskTitle':'#deskBody';}else{scroll('#deliveryWorkspace',100);target=local<12?'#deskNew':'label:has(#deskImport)';}}
    if(chapter===6){if(local<7){scroll('#deskRefBody',175);target=local<4?'#deskRefBody':'#deskReferenceAdd';click=local>=4;}else if(local<14){scroll('#deliveryResult',22);target='#demoCriterion'+Math.min(2,Math.max(0,Math.floor((local-7)/2)));click=true;}else{scroll('#deliveryClaims',70);target=local<21?'#demoEvidenceSelect':'#deskOrigin';click=local<21;if(local>=21){scroll('#deliveryResult',22);target='#deliverySummary';}}}
    if(chapter===7){if(local<8){scroll('.desk-exports',240);target=local<4?'#deskWord':'#deskPDF';click=true;}else{scroll('.desk-library',90);target='#deskBackup';click=true;}}
    focus(target,local,click);
    document.documentElement.dataset.chapter=String(chapter);document.documentElement.dataset.time=String(local);
  }
  window.addEventListener('message',async event=>{if(event.source!==parent)return;const m=event.data;if(m?.type==='relay-tutorial-ping'){parent.postMessage({type:'relay-tutorial-ready'},'*');return;}if(m?.type!=='relay-tutorial-seek'||!Number.isFinite(m.time)||!Number.isInteger(m.chapter)||m.chapter<0||m.chapter>7||!Number.isFinite(m.start)||!Number.isFinite(m.duration))return;apply(m.chapter,Math.max(0,m.time-m.start),m.duration);await document.fonts.ready;requestAnimationFrame(()=>parent.postMessage({type:'relay-tutorial-seeked',id:m.id},'*'));});
  apply(0,0,10);parent.postMessage({type:'relay-tutorial-ready'},'*');
})();
