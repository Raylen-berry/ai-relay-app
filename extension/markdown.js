(function(root) {
  'use strict';
  function render(target, text) {
    if (!root.marked?.parse || !root.DOMPurify?.isSupported) throw new Error('阅读视图未能加载，请切换到原文。');
    const html = root.marked.parse(text, {gfm:true, breaks:false, async:false});
    const fragment = root.DOMPurify.sanitize(html, {
      RETURN_DOM_FRAGMENT:true,
      ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','strong','em','del','s','code','pre','blockquote','ul','ol','li','hr','table','thead','tbody','tr','th','td','a'],
      ALLOWED_ATTR:['href','title','start','align'],
      ALLOWED_URI_REGEXP:/^https?:\/\//i
    });
    for (const link of fragment.querySelectorAll('a')) {
      link.setAttribute('target','_blank'); link.setAttribute('rel','noopener noreferrer');
    }
    for (const pre of fragment.querySelectorAll('pre')) {
      const button = document.createElement('button');
      button.type='button'; button.className='code-copy'; button.textContent='复制代码';
      button.addEventListener('click', async () => {
        try {await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || '');button.textContent='已复制';}
        catch {button.textContent='请选中代码复制';}
      });
      pre.prepend(button);
    }
    target.replaceChildren(fragment);
  }
  root.RelayMarkdown = {render};
})(globalThis);
