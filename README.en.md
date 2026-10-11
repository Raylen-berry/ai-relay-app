# AI Relay

[简体中文](README.md) · **English**

<img src="assets/relay-128.png" alt="AI Relay icon" width="96">

Relay brings material preparation, model execution and result checking into one workspace. It keeps the evidence used for each task and records what was checked and what remains unresolved.

It works with signed-in DeepSeek, ChatGPT and Kimi websites. DeepSeek and compatible Chat Completions text APIs are optional. Normal use does not require Node or Python.

Current version: **0.9.0 beta**, for Chrome and Edge on Windows.

## Install

1. [Download the Windows package](https://github.com/Raylen-berry/ai-relay-app/releases/download/v0.9.0/AI-Relay-0.9.0-Windows.zip) and extract it completely.
2. Run `安装到本机.cmd`. It installs to `%LOCALAPPDATA%\Programs\AI-Relay` and creates desktop and Start menu shortcuts.
3. Open the desktop shortcut to start the local workspace. Materials, history and optional APIs work without the extension.
4. For website models, enable Developer mode at `chrome://extensions/` or `edge://extensions/`, load the **installed extension folder**, and sign in to the models in that profile. Keep Developer mode enabled while using the unpacked extension.

The installer prefers Edge. To use Chrome, select it in the launch assistant and create the shortcuts. Both the assistant and shortcuts use the configured browser data directory and profile. Updates retain existing bindings; new installations default to Default. Other profiles can be selected through installer parameters.

The first extension load is manual. Keep the installation folder in place. Current and older packages are in [Releases](https://github.com/Raylen-berry/ai-relay-app/releases), with SHA256 files. Packages contain no account credentials, task data or development dependencies.

## Run a task

1. Enter a question, or prepare a data analysis, research report or document question.
2. Expand “任务要求与运行设置” (Task requirements and execution settings) to describe the purpose, output format and acceptance conditions. Enter one condition per line, up to 12 conditions of 500 characters each.
3. Choose an execution mode and models, then start the task. Material preparation does not call a model.
4. Send the result to Delivery, check numbers and evidence, and export the deliverable.

The three material workflows default to one model execution. Independent checking and the existing review routes remain available.

| Mode | Process |
| --- | --- |
| Single execution | Model 1 completes the task; tools and the user check the result |
| Independent check | Model 1 drafts; model 2 receives the original task and materials without the draft; model 1 compares both results |
| Review the draft | Models inspect the draft along a custom 3–9 turn route beginning and ending with model 1 |

Models can make the same mistake. Generated results and completed manual checks have separate states. Matching citation IDs, checked sources and model agreement never automatically approve a conclusion.

## Standalone delivery

Open **成果交付** (Delivery) at the top to receive the current result, choose a completed result from history, or paste text into a new artifact. UTF-8 TXT and Markdown files can also be imported. Receiving a result creates a separate copy; the original task and any running task remain unchanged.

Set the purpose, output format and acceptance criteria, then check each item. Citations such as [S1:P1] refer to saved excerpts; you can add excerpts manually. Each decision belongs to a specific statement and its evidence. Changing the body, evidence or criteria clears previous decisions. A reliable source does not automatically establish the conclusion.

Export the body, excerpts and review record as Markdown, Word or PDF, or back up the artifact library. Importing a library adds new copies without overwriting existing artifacts and clears imported decisions. Complete work packages include the library; older packages without one leave the current library intact.

Delivery makes no model requests and works without the web extension. Limits: 50 artifacts, five million characters in total, 300,000 body characters per artifact, 1 MB per UTF-8 text file, and 850 characters per excerpt. Reaching a limit prompts you to manage old records; none are silently removed.

## Material workflows

### Data analysis

Import CSV, TSV or XLSX, with the first row as headers. Select Excel worksheets. Local statistics cover every row of the current table: missing values, duplicates, sums, means, medians, ranges and sample standard deviations. Mixed text and unsafe integer columns remain text; missing values are not replaced with zero. Excel formulas use cached values and are not recalculated.

Explicit cleaning can trim whitespace, remove empty or duplicate rows, or restore the imported table. Grouped charts support sums, means and counts. Download XLSX reports, CSV, SVG charts and statistical notes. Models receive statistics, up to 100 grouped values and the first 15 sample rows.

A frozen local metric ledger checks the structured numbers that a model lists in its result. Incorrect or unknown metrics are flagged. **Only numbers in the designated checking block are compared.** Narrative numbers, the suitability of the calculation and causal explanations remain outside this check. Missing blocks are shown as unverified. Imported historical ledgers are not treated as freshly computed data.

Limits: 5,000 rows and 100 columns per sheet, 20 sheets and 100,000 cells per workbook, 10 MB per file.

### Research reports

Choose public HTTPS pages, import files or paste text. Fetching from the local workspace is subject to website cross-origin restrictions; the extension workspace requests host permission. Both omit login cookies and reject redirects. Paste text for dynamic or restricted pages. Sources are checked by the user.

The task records the selected documents and the exact excerpts supplied to the model. Long documents provide partial text, with the scope stated. Reports can describe findings, disagreements, limitations and recommendations. This workflow uses selected materials; it does not automatically research the entire web.

Citation IDs such as [S1:P2] open saved excerpts. Each cited statement has a separate supported, contradicted or uncertain decision and an optional note. Reusing one excerpt for different statements requires separate checks. Unknown IDs cannot be marked supported. Changing a statement or its evidence invalidates the previous judgment.

### Document organization and questions

Import TXT, Markdown, DOCX body text and tables, or text-layer PDFs; pasted text also works. Edit titles, categories, text and source links. PDF pages retain locators; scanned images are not recognized.

Questions use local Chinese and English keyword retrieval, supplying up to eight selected excerpts. Organization prepares a category index and summaries. The UI and exports state the actual document, paragraph and supplied-text scope. **Failure to retrieve evidence does not establish that no evidence exists.**

Limits: 10 MB and 200,000 characters per document, 200 PDF pages, 50 documents and one million characters in the collection. OCR, vector retrieval and arbitrary code execution are not implemented.

## Results and portable work packages

Export Markdown, Word or PDF with excerpts, acceptance conditions, manual decisions, retrieval scope and execution limits. The task library includes started tasks that have not yet received an answer, retains up to 100 records, and supports search, tags and export. Loading a question never sends it. Original attachments must be selected again.

A complete work package contains tasks, queued items, document text, tables and the artifact library for restoration in another browser. The whole input is validated before replacement. If a cross-store restore is interrupted, the next owning workbench rolls back to the records before restoration. Importing never starts model calls or the queue. Attachment jobs wait for files to be selected again; missing API connections require configuration.

Packages exclude configured API keys, live sessions and original attachment files, but may contain private document text. Download and store them carefully. Runtime records are written automatically to the installation’s `data` folder independently of the browser profile. Downloaded packages provide a separate backup for moving computers. Website models still need the extension and fresh logins.

Use “Migrate old browser records” in the delivery settings to replace the local materials and task library with records from the selected browser profile. Back up the current workspace first. Browser originals remain intact; keys and original attachments are not transferred, and migration never starts tasks.

## Limits and recovery

Set active-processing time, API send attempts and per-request output tokens. Limits are checked before new sends. Reaching a limit pauses the task with existing content retained; increasing the allowance requires an explicit user action. API waits also use the remaining task time. Sent requests may keep processing; these limits do not guarantee a monetary bill cap.

Truncated API output is retained and shown for manual completion. Uncertain network failures do not silently resend or switch services. Website, login, attachment and completion-marker failures have separate explanations. Repair the page, send manually or paste a complete answer. Pausing prevents subsequent transmissions but cannot recall an existing request. Reopened unfinished tasks remain paused.

## APIs, attachments and privacy

Configure the endpoint, model and key. The local core sends API requests; the directly opened extension workspace still requests host permission. DeepSeek defaults to its [official API](https://api-docs.deepseek.com/) and deepseek-flash in non-thinking text mode. Custom services must accept Chat Completions, system messages and max_tokens; incompatibility pauses the task. Provider support and billing rules apply.

Local keys default to the current core process session. Optional persistent keys are encrypted for the current Windows account. Session keys must be entered again after the core exits. The directly opened extension workspace retains its browser-session or unencrypted persistent storage behavior. Clear saved keys removes both stores; backups exclude configured keys.

APIs support text tasks. Use website models for file attachments: up to 10 files, 20 MB each and 50 MB total. Files are kept locally before sending, then uploaded once per participating conversation. Supported formats depend on the website model.

## Current boundaries

The Windows core provides the workspace entry, disk persistence and API request journal on a random loopback-only port. Requests require a random connection credential; cross-site writes are rejected. Its data folder is restricted to the current Windows account, SYSTEM and administrators. The paired extension can operate only task tabs created through this connection, not arbitrary browser tabs.

Materials, history and API execution remain available when the extension is disabled. Website models show a connection error. API request IDs are recorded before dispatch, completed responses can be recovered, and uncertain sends are never automatically repeated. Task scheduling still requires the workspace page to stay open; closing it does not run the remaining workflow in the background. Website changes, expired logins and provider failures still need repair.

The code reads no cookies and contains no telemetry, remote code or facility for executing commands found in documents. Source text and model responses do not grant tool permissions. Separate API system instructions clarify this boundary without guaranteeing resistance to every malicious text instruction.

See [validation records](验证记录.md) for exact test scope. Transport and file checks do not establish improved real-world output quality. Compare review modes with the same materials, tools and acceptance conditions, including manual checking time and total cost. The package includes [fictional samples](示例资料) and a [workflow guide](三项流程试用指南.md).
