const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const {read}=require('../extension/markdown-source.js');
const node=html=>parseHTML('<div id="answer">'+html+'</div>').document.getElementById('answer');
test('assistant tables, headings and code survive collection as readable Markdown',()=>{
  const text=read(node('<h2>结果</h2><table><tr><th>项目</th><th>值</th></tr><tr><td>数量</td><td>4</td></tr></table><pre><code class="language-js">const n = 4;\n  console.log(n);</code></pre><p>【接力结束_keep】</p>'));
  assert.match(text,/## 结果/);assert.match(text,/\| 项目 \| 值 \|/);
  assert.match(text,/\| 数量 \| 4 \|/);assert.match(text,/```js\nconst n = 4;\n  console.log\(n\);\n```/);
  assert.ok(text.includes('【接力结束_keep】'));
});
test('nested lists keep their text and UI buttons or thinking blocks stay out of collected answers',()=>{
  const text=read(node('<ul><li>检查事实<ul><li>核对来源</li></ul></li><li>修正表述</li></ul><button>复制按钮不属于答案</button><div class="thinking-container">内部思考</div>'));
  assert.match(text,/- 检查事实/);assert.match(text,/- 核对来源/);
  assert.ok(!text.includes('复制按钮')&&!text.includes('内部思考'));
});
test('plain text stays unchanged and code containing fences is preserved',()=>{
  assert.equal(read(node('普通回答【接力结束_plain】')),'普通回答【接力结束_plain】');
  const text=read(node('<pre><code>```text\nexample\n```</code></pre>'));
  assert.match(text,/^````\n```text\nexample\n```\n````$/);
});

test('page wrappers do not add large gaps and blank lines inside code remain exact',()=>{
  const text=read(node('<div><div><p><strong>结论</strong></p></div></div><div><div><p>继续检查</p></div></div><pre><code>first\n\n\nsecond\n  indented</code></pre><p>【接力结束_spacing】</p>'));
  assert.match(text,/\*\*结论\*\*\n\n继续检查\n\n```/);
  assert.ok(text.includes('first\n\n\nsecond\n  indented'));
  assert.ok(text.endsWith('【接力结束_spacing】'));
});
