(function(root) {
  'use strict';
  const escape = text => text.split(/(【接力[^】\n]*】)/g).map(part =>
    /^【接力[^】]*】$/.test(part) ? part : part.replace(/([\\`*_[\]<>|])/g, '\\$1')).join('');
  const skipped = new Set(['BUTTON','SCRIPT','STYLE','SVG','IMG','IFRAME','INPUT','TEXTAREA']);
  function normalizeBlocks(text) {
    let fence = null, blanks = 0;
    return text.split('\n').filter(line => {
      const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
        return true;
      }
      if (marker) {fence = marker[1];blanks = 0;return true;}
      if (!line.trim()) return ++blanks <= 1;
      blanks = 0;
      return true;
    }).join('\n').trim();
  }
  function walk(node) {
    if (node.nodeType === 3) return escape(node.nodeValue || '');
    if (node.nodeType !== 1 || skipped.has(node.tagName) || node.matches('[aria-hidden="true"], .thinking-container')) return '';
    const children = () => [...node.childNodes].map(walk).join('');
    const tag = node.tagName;
    if (tag === 'BR') return '\n';
    if (tag === 'PRE') {
      const code = node.querySelector('code') || node;
      const text = code.textContent.replace(/\n$/, '');
      const runs = text.match(/`+/g) || [];
      const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
      const lang = code.className.match(/language-([a-z0-9_-]+)/i)?.[1] || '';
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
    }
    if (tag === 'CODE') {
      const text = node.textContent;
      const fence = '`'.repeat(Math.max(1, ...(text.match(/`+/g) || []).map(run => run.length + 1)));
      return `${fence} ${text} ${fence}`;
    }
    if (/^H[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${children().trim()}\n\n`;
    if (tag === 'STRONG' || tag === 'B') return '**' + children() + '**';
    if (tag === 'EM' || tag === 'I') return '*' + children() + '*';
    if (tag === 'DEL' || tag === 'S') return '~~' + children() + '~~';
    if (tag === 'A') {
      const text = children();
      const href = node.getAttribute('href') || '';
      return /^https?:\/\//i.test(href) ? `[${text}](${href.replace(/[()\s]/g, c => encodeURIComponent(c))})` : text;
    }
    if (tag === 'TABLE') {
      const rows = [...node.querySelectorAll('tr')].map(row => [...row.children].filter(cell => /^(TH|TD)$/.test(cell.tagName)).map(cell => [...cell.childNodes].map(walk).join('').trim().replace(/\n+/g, '<br>'))).filter(row => row.length);
      if (!rows.length) return '';
      const width = Math.max(...rows.map(row => row.length));
      const line = row => '| ' + Array.from({length:width}, (_,i) => row[i] || '').join(' | ') + ' |';
      return '\n\n' + [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n\n';
    }
    if (tag === 'UL' || tag === 'OL') {
      const start = Number(node.getAttribute('start')) || 1;
      return '\n\n' + [...node.children].filter(child => child.tagName === 'LI').map((child,i) => {
        const text = [...child.childNodes].map(walk).join('').trim();
        return (tag === 'OL' ? `${start+i}. ` : '- ') + text.replace(/\n/g, '\n  ');
      }).join('\n') + '\n\n';
    }
    if (tag === 'BLOCKQUOTE') return '\n\n' + children().trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
    if (tag === 'HR') return '\n\n---\n\n';
    const text = children();
    return tag === 'P' || tag === 'DIV' ? '\n\n' + text + '\n\n' : text;
  }
  function read(element) {
    if (!element) return '';
    if (!element.querySelector('h1,h2,h3,h4,h5,h6,pre,table,ul,ol,blockquote,strong,em')) return (element.innerText || element.textContent || '').trim();
    // Page layout wrappers may add blank lines; code spacing belongs to the answer.
    return normalizeBlocks(walk(element));
  }
  root.RelayMarkdownSource = {read};
  if (typeof module !== 'undefined') module.exports = {read};
})(globalThis);
