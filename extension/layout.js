(function(root) {
  'use strict';
  const defaults = {share:50, inputHeight:300, outputHeight:300};
  function normalize(value = {}) {
    const bound = (key,min,max) => Number.isFinite(Number(value?.[key]))
      ? Math.max(min,Math.min(max,Math.round(Number(value[key])))) : defaults[key];
    return {share:bound('share',30,70), inputHeight:bound('inputHeight',180,1200), outputHeight:bound('outputHeight',180,1200)};
  }
  function init(initial, onChange) {
    const $ = id => document.getElementById(id);
    let state = normalize(initial), timer;
    const publish = () => {clearTimeout(timer);timer=setTimeout(()=>onChange({...state}),250);};
    function draw() {
      $('workspace').style.setProperty('--input-share',state.share+'fr');
      $('workspace').style.setProperty('--output-share',(100-state.share)+'fr');
      $('panelWidth').value=state.share;
      $('panelWidthValue').textContent=`输入 ${state.share}% · 输出 ${100-state.share}%`;
      $('panelDivider').setAttribute('aria-valuenow',String(state.share));
      for(const [key,box] of [['inputHeight','question'],['outputHeight','finalOut']]) {
        $(box).style.height=state[key]+'px';$(key).value=state[key];$(key+'Value').textContent=state[key]+' px';
      }
    }
    function set(value) {state=normalize(value);draw();publish();}
    $('panelWidth').addEventListener('input',()=>set({...state,share:Number($('panelWidth').value)}));
    for(const key of ['inputHeight','outputHeight']) $(key).addEventListener('input',()=>set({...state,[key]:Number($(key).value)}));
    $('resetLayout').addEventListener('click',()=>set(defaults));
    const divider=$('panelDivider');
    divider.addEventListener('keydown',event=>{
      const changes={ArrowLeft:state.share-1,ArrowRight:state.share+1,Home:30,End:70};
      if(event.key in changes){event.preventDefault();set({...state,share:changes[event.key]});}
    });
    divider.addEventListener('dblclick',()=>set({...state,share:50}));
    let pointer = null;
    divider.addEventListener('pointerdown',event=>{
      if(event.button !== 0)return;
      pointer=event.pointerId;divider.setPointerCapture(pointer);divider.classList.add('dragging');event.preventDefault();
    });
    divider.addEventListener('pointermove',event=>{
      if(pointer !== event.pointerId)return;
      const rect=$('workspace').getBoundingClientRect(), available=rect.width-28;
      if(available>0)set({...state,share:(event.clientX-rect.left-14)/available*100});
    });
    const finish=()=>{pointer=null;divider.classList.remove('dragging');};
    divider.addEventListener('pointerup',finish);divider.addEventListener('pointercancel',finish);divider.addEventListener('lostpointercapture',finish);
    // Native textarea bottom-corner resizing is also retained and saved.
    if(typeof ResizeObserver !== 'undefined') {
      const observer=new ResizeObserver(entries=>{
        let changed=false;
        for(const entry of entries) {
          const key=entry.target.id==='question'?'inputHeight':'outputHeight';
          const height=Math.round(entry.target.getBoundingClientRect().height);
          if(height>=180 && height<=1200 && height!==state[key]){state[key]=height;changed=true;}
        }
        if(changed){draw();publish();}
      });
      observer.observe($('question'));observer.observe($('finalOut'));
    }
    draw();
    return {get:()=>({...state}),set};
  }
  root.RelayLayout={normalize,init};
  if(typeof module!=='undefined')module.exports={normalize};
})(globalThis);
