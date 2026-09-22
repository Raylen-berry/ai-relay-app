(function(root) {
  'use strict';
  const normalize = text => String(text ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
  const block = node => node.nodeType === 1 && /^(P|DIV|LI|PRE|BLOCKQUOTE|H[1-6])$/.test(node.tagName);
  function body(node) {
    const children = [...node.childNodes];
    const parts = []; let inline = '';
    const flush = () => { if (inline !== '') { parts.push(inline); inline = ''; } };
    for (const child of children) {
      if (child.nodeType === 3) inline += child.textContent;
      else if (child.nodeType === 1) {
        if (child.tagName === 'BR') {
          // Empty paragraphs and ProseMirror's trailing break are caret aids.
          if (children.length !== 1 && !child.classList.contains('ProseMirror-trailingBreak')) inline += '\n';
        } else if (block(child)) {
          flush(); parts.push(body(child));
        } else inline += body(child);
      }
    }
    flush();
    return parts.join('\n');
  }
  function read(element) {
    if (!element) return '';
    if (/^(TEXTAREA|INPUT)$/.test(element.tagName)) return normalize(element.value);
    // innerText inserts layout-dependent blank lines between <p> elements.
    // Reconstruct the editor document so long multiline prompts compare exactly.
    return normalize(body(element));
  }
  const same = (a, b) => normalize(a) === normalize(b);
  // Recover only the exact newline-loss transform observed in Kimi 0.3.6.
  // The pending task marker and every other character must still match.
  function lostLineBreaks(draft, prompt, marker) {
    const expected = normalize(prompt), actual = normalize(draft);
    return !!marker && expected.includes('\n') && expected.split(marker).length === 2 &&
      actual.includes(marker) && !same(actual, expected) && actual === expected.replace(/\n/g, '');
  }
  const api = {normalize, read, same, lostLineBreaks};
  if (typeof module !== 'undefined') module.exports = api;
  root.RelayEditor = api;
})(globalThis);
