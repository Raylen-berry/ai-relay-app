# AI 互审 · Relay 0.4.3

<img src="assets/relay-128.png" alt="AI 互审图标" width="96">

Windows 启动助手 + Chromium Manifest V3 扩展。使用同一浏览器配置内已登录的 DeepSeek / ChatGPT / Kimi 网页，按自定义顺序完成初稿、多轮审核和原对话定稿。实际执行者是浏览器扩展；EXE 只负责启动和安装引导。

用户请先打开 `开始使用.html`。运行无第三方依赖，无需 Node/Python/API Key。

## 安装包

下载 [Windows 安装包](AI-Relay-0.4.3-Windows.zip) 并完整解压，双击 `安装到本机.cmd`。默认安装到 `%LOCALAPPDATA%\Programs\AI-Relay`，优先 Edge，未安装时使用 Chrome，创建桌面与开始菜单快捷方式。无需 D 盘或管理员权限。也可打开 `AI互审启动助手.exe` 选择浏览器并安装。首次需在所选浏览器手动加载安装目录内的 extension，再登录模型。详见 [换机安装](换机安装.md)。

安装 ZIP 只含运行文件和说明，不包含账号登录信息、聊天记录或开发依赖。源码、测试、锁定的依赖版本及图标原图留在仓库中，可重新构建。旁边的 `.sha256` 文件用于校验下载包。现有自定义安装用 `Install.ps1 -InstallDir 原目录 -Browser edge` 覆盖即可。

图标为简洁线条风：哑光深色圆底、两段循环箭头与细线闪电，无 AI 字样和玻璃高光。矢量源文件在 assets/relay-icon.svg，设计说明见 assets/icon-design.md。PNG、ICO、EXE、扩展及工作台标识统一。

## 开发与验证

需要 Node 22+。`npm ci --ignore-scripts` 后执行 `npm test`。测试依赖 linkedom 只用于 DOM fixtures，不包含于扩展运行环境。

`npm run package` 生成本版运行 ZIP 与 SHA256 校验文件。需先运行 `npm run build`、`npm test`。

`node tools-build.cjs` 先从仓库保存的 SVG 图标源文件生成各尺寸图标，再使用系统 .NET Framework C# 编译器生成带图标的启动助手，并在首次构建时生成稳定的公开扩展标识。仅存公钥，无私钥。不要更改 manifest.json 中的 key，否则扩展 ID 和本地数据空间会变化。

`node preview-server.cjs` 在 127.0.0.1:8766 提供界面预览，不连接任何模型。浏览器自动化运行需安装 extension 文件夹。

## 文件

- extension/core.js：纯模板、解析、导入、完成检测。
- extension/engine.js：可测试的多轮接力状态机。
- extension/content.js：网站内容脚本；显式消息触发读取/发送，发送幂等账本。
- extension/adapters.js：网页控件适配规则。
- extension/app.*：独立操作窗口，任务保存在 chrome.storage.local。
- extension/background.js：单窗口入口，不承载长运行任务。
- launcher/Launcher.cs：Windows 启动助手。

## 设计边界

只要求 storage、clipboardWrite 和三个网站的 host permissions；不读取 Cookie，不使用 debugger 权限、抓包或内部接口，不接触其他域。无遥测、后端和远程代码。host permissions 可读取对应网站标签页，实际代码仅在工作台主动请求时读取任务网页。存储访问限制为扩展的 trusted contexts。

每轮随机唯一结束标记 + 正式回答区域 + 非生成状态 + 6 秒稳定窗口。没有标记时不猜测回答已结束，暂停后可人工接续。支持普通文字对话和长文字自动转换的 TXT 附件；研究、代理工具、图片及其他文件工作流不在本版验证范围内。

发送前持久化 dispatching；通信丢失后不重发，恢复只读结果。任务窗口重开后暂停，需显式继续。navigator.locks 防止多个工作台同时驱动。停止阻止后续传递，不能撤回已发送请求，不承诺停止远端生成。

创建独立任务页面，共享浏览器的登录状态；不会附着或改写用户已有聊天。所有任务页打开后会切回第一模型；每轮复用对应模型原对话并核对上一次标记。最终结果保存后自动关闭这些任务页。因刷新、虚拟滚动、网页改版或上下文丢失无法核实时暂停。

网页适配是持续维护项。2026-09-21 核对 DeepSeek/ChatGPT 现有控件、Kimi 输入/发送/思考和正文分区，并通过 Kimi 简短网页测试。新版完整扩展多轮链路尚未验证。不要将模拟测试写成真实模型端到端测试。

## 更新

0.4.3：图标改为简洁线条风，保留循环与自动执行含义，去掉玻璃质感。同步更新桌面、启动助手、扩展、工作台及换机安装包。

0.4.2：支持拖动分隔线调整输入/输出宽度、独立调整文字框高度及滑条微调，尺寸自动保存并随 JSON 迁移。新图标去掉字母，以立体玻璃循环和闪电表现自动接力。新增双击安装入口、当前用户目录安装、启动助手安装按钮、换机指南及可重复打包脚本。用户反馈当前核心接力功能没有明显问题；本次保留原有发送与接续流程。

0.4.0：支持 1-2-1 或 1-2-3-2-1 等 3–9 轮自定义顺序，首尾为第一模型。超过 2500 字符的提示词按段发送，每段须收到唯一确认标记后继续，降低超长粘贴压力（仍可能按字节阈值转换为 TXT；0.4.1 已支持附件发送）；模型若不按要求确认，会暂停并允许手动接管。工作台提供“手动接管本轮”、手动发送后继续收取，以及粘贴完整回答并自动跳到下一轮。扩展重新加载不再弹出工作台；任务开始时切回第一模型，完成并保存结果后关闭应用创建的模型页面。图标已更新。

0.3.7：修正 Kimi 多行提示词被 insertText 去掉换行的问题。Lexical 输入区改用纯文本 paste 事件，随后严格核对全文再点击一次发送。对当前任务旧版遗留草稿，仅在唯一标记及其他全部字符一致、只缺少换行时恢复原文。更新后需要重新加载扩展并刷新模型任务页，工作台会识别旧连接脚本。

0.3.6：暂停任务后可以直接编辑问题，为下一次互审准备内容；继续原任务时仍使用原问题。输入框旁新增“新问题”按钮，清空输入并暂留上次结果，点击“开始互审”才发送。重复打开时显示固定提示和“前往已打开的工作台”；原窗口关闭后，等待窗口会自动接管并读取最新记录。

0.3.5：按编辑器的段落结构校验长提示词，避免页面排版产生的额外换行阻止发送；只有整段文字一致才允许续发。每次尝试只提交一次，取消和网页切换时不再连续触发表单/回车；已发出的用户消息或被清空的待发草稿会转入等待，避免重复发送。旧连接脚本会明确要求刷新模型任务页。

保留 extension 文件夹路径和 manifest key，修改适配器后在浏览器扩展页点击重新加载，再刷新模型任务页面。建议先导出工作台 JSON。导入 v2/v3 只恢复允许的文字字段，不导入标签页标识、运行状态或任意站点地址。

参考：[Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[Chrome windows API](https://developer.chrome.com/docs/extensions/reference/api/windows)、[加载本地扩展](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。
