# AI Relay

[简体中文](README.md) · **English**

<img src="assets/relay-128.png" alt="AI Relay icon" width="96">

AI Relay connects the steps you would otherwise do by hand in model web apps: ask one model for a draft, have other models review it, then return to the original conversation to revise the answer.

It works with the web versions of DeepSeek, ChatGPT, and Kimi, using your signed-in browser accounts. You can also configure DeepSeek or a compatible API service. Website reviews do not require an API Key, and everyday use does not require Node or Python.

Current version: **0.6.1 beta** for Windows, with Chrome or Edge.

## Install

1. [Download the Windows package](https://github.com/Raylen-berry/ai-relay-app/releases/download/v0.6.1/AI-Relay-0.6.1-Windows.zip) and extract the whole archive.
2. Run `安装到本机.cmd`. It installs to `%LOCALAPPDATA%\Programs\AI-Relay` by default and creates desktop and Start menu shortcuts.
3. Open `chrome://extensions/` or `edge://extensions/` in the browser you want to use. Turn on **Developer mode**, choose **Load unpacked**, and select the **extension folder inside the installation directory**.
4. Sign into the model websites in that browser, then open the desktop shortcut named “AI 互审”.

The install script prefers Edge. To choose Chrome, open `AI互审启动助手.exe`, select Google Chrome, and click “安装到本机 / 创建快捷方式”.

Loading the extension is a manual step on first use. Keep the installation directory: the browser reads the extension from there. The package includes an [installation guide](开始使用.html) and [instructions for another computer](换机安装.md), both in Chinese.

Current and older packages are available in [Releases](https://github.com/Raylen-berry/ai-relay-app/releases). The repository root contains source code and documentation. The archive contains no accounts, chat history, or development dependencies. The adjacent `.sha256` file lets you check its integrity.

## Use it

Choose the models and a route, enter your question, and click “开始互审” (**Start review**). The three-round and five-round buttons fill in common routes; you can also type your own. The numbers refer to the model slots above:

| Route | What happens |
| --- | --- |
| `1-2-1` | Model 1 drafts, model 2 reviews, model 1 revises |
| `1-2-3-2-1` | Model 1 drafts, models 2, 3, and 2 review in turn, model 1 revises |

A route can have 3–9 rounds and must begin and end with model 1. The third model is enabled when the route uses it. Each task starts new model conversations and returns to those conversations in later rounds. Your existing chats remain available.

Keep the workbench and task pages open while a task runs. Once the final answer is saved on the right, the task pages close automatically. Expand “每轮回答与手动处理” (**Round answers and manual handling**) to see the draft, reviews, and full revision. Opening the desktop shortcut again brings you back to the existing workbench.

Results open in “阅读” (**Reading**) view, with headings, tables, lists, and code blocks. Choose “原文” (**Raw text**) to see the collected Markdown. “复制结果” (**Copy result**) copies that text; code blocks have their own copy button.

Relay uses whichever model and mode each website currently has selected. Start with a short question when trying a new setup.

### Task library and queue

Tasks with saved answers appear in “任务库” (**Task library**), with up to 100 records. Search questions or results, add tags, reload a question, or back up the library. Reloading restores the question and settings without sending anything; reselect historical attachments. Deleting a library record leaves the model website conversation intact.

“把当前问题加入队列” (**Add current question to queue**) keeps the question, attachments, model choices, route, and review roles as they are when added. In “批量队列” (**Batch queue**), separate questions with a blank line; a question may contain several lines of material. Run the queue to process them in order. A paused item holds later items. Reopening the workbench leaves the queue stopped until you choose to continue.

### Review roles, comparison, and exports

Expand “每轮审核分工” (**Review roles by round**) to choose a general, fact, logic, style, or opposing reviewer for each intermediate round. The chosen focus becomes part of that round’s prompt.

“结果对比与核查” (**Comparison and checks**) shows changes between the draft and final answer. Large texts appear side by side. Candidate issues come from review lines containing severity or uncertainty wording; the list may miss issues and does not infer which ones the final answer resolved. Check them off yourself after reading. Source links come from model answers and remain unverified until you mark them checked.

Download the final result as Markdown or a Word .docx. “PDF…” opens the browser print view; choose **Save as PDF**. A full review export includes the question, all rounds, and issue/source checkmarks. Optional desktop reminders notify you when a task finishes or pauses. Clicking a reminder returns to the workbench. Browser and operating system notification settings affect delivery.

### Optional API connections

Under “设置与记录 → 可选 API” (**Settings and records → Optional API**), choose DeepSeek or enter a compatible service’s URL, model name, and Key. Connections use Chat Completions. The URL may be a service root, a versioned base URL, or a complete /chat/completions endpoint. Saving asks for access to that specific origin, then adds the connection to the model selectors.

DeepSeek defaults to https://api.deepseek.com and deepseek-flash, using non-thinking text mode. Change the model name to match your service and account. Check [DeepSeek’s documentation](https://api-docs.deepseek.com/) for its current models.

This first API version handles text tasks. Use website models for image or file attachments; unsupported attachments are blocked before sending. Website and API models may share a text review. Requests go directly to the configured service and are billed under its terms. An interrupted request with uncertain delivery stays paused for manual handling and is not automatically retried.

Keys live in browser session storage by default. If you choose persistent storage, the Key stays in this browser’s local storage without additional encryption. Task exports and library backups exclude Keys. Enter them again on another computer. Website reviews remain available without an API Key.

### Images and files

Click “添加附件” (**Add attachments**), drag files into the attachment area, or paste a screenshot into the question field. You can add up to 10 files: 20 MB per file and 50 MB in total. Supported file formats depend on the model website.

Selected files are stored locally until you start the task. Each participating model conversation receives the files once. For example, `1-2-1-3-1` uploads to models 1, 2, and 3 once each; later rounds reuse the files in those conversations.

### If a task gets stuck

The workbench distinguishes login, page connection, attachment, and end-marker problems, and suggests what to do next. “查看当前网页” (**Open task page**) opens the model page that needs attention. You can then:

- Fix the task page and click “继续当前步骤” (**Continue current step**).
- Click “手动处理本轮” (**Handle this round manually**), send the message on the model website, then return and click “已手动发送，继续收取” (**Sent manually; collect the answer**).
- Paste the complete answer into the manual answer field and click “保存回答并继续” (**Save answer and continue**).

When Relay cannot confirm that a message was sent, it pauses rather than sending it again. “暂停” (**Pause**) stops further handoffs. Requests already sent to a website may continue generating.

Completion depends on the model including the requested end marker. If the response is visibly finished but Relay keeps waiting, pause the task and paste the complete answer into the manual answer field.

Reopening the workbench restores its local records. An unfinished task stays paused until you continue it. “新问题” (**New question**) keeps the previous result visible until the next task starts.

## Save records or move to another computer

Questions, prompts, round answers, and panel sizes are saved in the current browser. Under “设置与记录” (**Settings and records**), use “导出记录” or “导入记录” to export or import a JSON file.

The JSON includes attachment metadata, but not the original files. Keep those files separately and select them again on the new computer. You also need to sign into the model websites again.

“清空本地记录” (**Clear local records**) removes the extension's task records and cached attachments. Export anything you want to keep first.

## Scope and checks

The browser extension operates the model pages. The Windows launcher helps with installation and opening the workbench.

The extension requests local storage, clipboard access, and access to the three model websites. API origins and desktop notifications require separate optional permission when enabled. It does not read cookies and has no telemetry or remotely loaded code. Website mode sends through the model pages; API mode calls your configured endpoint directly.

Answer collection checks the round's end marker, generation state, and a period of stable output. Research and agent workflows, and the Kimi desktop app, are outside the current scope.

Version 0.6.0 passed 103 local tests and 49 independent Chrome feature/boundary checks, including two five-round queue tasks against a local simulated API. Live provider APIs have not been tested with a real Key. Notification delivery was mocked in the checks; actual display depends on browser and system settings. Website testing from 0.5.2 is recorded below. On this computer in Chrome, both a three-round text-only task and a five-round `1-2-1-2-1` task with an image and a text file completed using DeepSeek and ChatGPT. Later rounds reused attachments in the original conversations, and the final checks were correct. Kimi was not rechecked in this round; other accounts and modes still need their own checks. See the [validation log](验证记录.md) and [change log](更新记录.md), both in Chinese.

## Development

Use Node 22 or later. From the repository directory:

```sh
npm ci --ignore-scripts
npm test
node tools-check.cjs
```

To rebuild the launcher and icons, then create the Windows archive:

```sh
npm run build
npm run package
```

The launcher build uses the system .NET Framework C# compiler. Archives and checksums are written to `dist/`. The extension bundles the files it needs locally and does not load remote scripts.

`node preview-server.cjs` serves the interface preview at `http://127.0.0.1:8766`. `node tools-browser-check.cjs` serves the browser storage and file transfer checks at `http://127.0.0.1:8767`. Neither sends questions to models.

| Files | Purpose |
| --- | --- |
| `extension/workspace.js`, `workspace-data.js`, `workspace.css` | Task library, queue, comparison, and checks |
| `extension/api.js`, `exports.js`, `print.*` | Optional API, Word export, and PDF print view |
| `extension/app.*`, `app-polish.css` | Workbench interface and local records |
| `extension/engine.js`, `issues.js` | Multi-round task flow and stall guidance |
| `extension/markdown-source.js`, `markdown.js` | Answer formatting and result reading view |
| `extension/core.js` | Prompts, result parsing, and data import |
| `extension/adapters.js`, `content.js` | Model page detection and interaction |
| `extension/files.js`, `upload.js` | Attachment storage and upload |
| `extension/background.js` | Workbench entry point |
| `launcher/Launcher.cs` | Windows launcher |

Keep the `key` in `manifest.json`. Changing it changes the extension ID and breaks the connection to existing shortcuts and local data. After changing page adapters, reload the extension and refresh its model task pages.

## Recent changes

**0.6.1**: Removed an unsupported IPv6 CSP source that Chrome reported as a warning. Local HTTP API connections use localhost or 127.0.0.1.


**0.6.0**: Added a searchable task library with tags, a batch queue, per-round review roles, draft comparison, candidate issues and source links. Added Markdown/Word exports, PDF printing, optional API connections, and desktop reminders.


**0.5.2**: Added guidance for stalled tasks and a reading view. Preserved tables, headings, and code during answer collection, while removing extra layout whitespace. Fixed confirmation when ChatGPT renames uploaded files and strengthened chunk receipt instructions. Moved installer packages to Releases.

**0.5.1**: Updated model menus, route shortcuts, progress indicators, and interface text. Fixed answer collection for ChatGPT's new page layout. Added Chinese and English READMEs with links to switch between them.

**0.5.0**: Added images and files, restored attachment lists after reopening, and avoided repeat uploads within a model conversation. Reopening the desktop shortcut reuses the existing workbench.

Earlier changes are listed in the [change log](更新记录.md).
