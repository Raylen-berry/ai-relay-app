# AI Relay

[简体中文](README.md) · **English**

<img src="assets/relay-128.png" alt="AI Relay icon" width="72">

Prepare materials, run models, review drafts and check deliverables in one workspace. Use one model, request an independent check, or pass a draft through several review rounds. Relay keeps the materials and checking records used for each task.

**Windows · Chrome / Edge · [0.9.0 beta](https://github.com/Raylen-berry/ai-relay-app/releases/tag/v0.9.0)**

[Download Windows package](https://github.com/Raylen-berry/ai-relay-app/releases/download/v0.9.0/AI-Relay-0.9.0-Windows.zip) · [Install guide](docs/安装.md) · [Getting started](docs/使用.md) · [Guide index](docs/README.md)

## What it does

| Feature | Use |
| --- | --- |
| Model review | Draft, review and return a final answer in a custom model order |
| Data analysis | Import tables, calculate local statistics, then prepare a model report |
| Research reports | Compare selected webpages, files or pasted materials and keep their sources |
| Document Q&A | Find relevant passages with keyword search and prepare an answer with references |
| Delivery | Receive model results or existing text, check evidence and export Markdown, Word or PDF |

Website mode uses signed-in **DeepSeek, ChatGPT and Kimi** accounts. Text APIs are optional. Normal use needs no Node or Python. Material preparation and standalone Delivery do not send model requests.

## Choose an execution mode

| Mode | Process | Use |
| --- | --- | --- |
| Single completion | Model 1 answers; tools and you check the result | Complete a task and check it |
| Independent check | Model 2 sees the original task and materials, without the draft; model 1 reconciles both results | Obtain a second judgment |
| Review after seeing the draft | Review and revise in a custom order, returning to model 1; 3–9 rounds | Inspect and revise a draft over several rounds |

Review feedback is another judgment. Figures, evidence and acceptance conditions still need checking. See the [review guide](docs/互审.md).

## First task

1. Extract the whole package, run **安装到本机.cmd**, then open the **AI 互审** desktop shortcut.
2. For website models, load **extension/** from the installed folder and sign in within the same browser profile. See [installation](docs/安装.md).
3. Enter a question or use the [fictional samples](示例资料/). Set acceptance conditions, choose models and execution mode, then start.
4. Send the completed result to **Delivery**, check its content and evidence, then export.

Keep the workspace and task webpages open while running. Connection problems and uncertain sends pause for handling; see [troubleshooting](docs/常见.md).

[Watch the 2:08 video](https://github.com/Raylen-berry/ai-relay-app/releases/download/v0.9.0/AI-Relay-Quick-Start-v2.mp4) · [Download offline tutorial](https://github.com/Raylen-berry/ai-relay-app/releases/download/v0.9.0/AI-Relay-Web-Tutorial-v2.zip) — narration and captions are in Chinese.

## Guides

Detailed guides below are in Chinese.

| Topic | Guide |
| --- | --- |
| Install, extension setup and updates | [Install](docs/安装.md) |
| Tasks, attachments, queues and interruption | [Use](docs/使用.md) · [Review](docs/互审.md) |
| Analysis, research and document Q&A | [Workflows](docs/流程.md) · [Samples](docs/试用.md) |
| Evidence checks, existing text and export | [Delivery](docs/交付.md) |
| Records, backup and moving computers | [Data](docs/数据.md) |
| Connection, incomplete answers and recovery | [Troubleshooting](docs/常见.md) |

<details>
<summary>Advanced: API, development, validation and history</summary>

[API](docs/API.md) · [Development](docs/开发.md) · [Validation](docs/验证.md) · [Plans](docs/方向.md) · [Changelog](更新记录.md) · [History](docs/历史.md)

</details>
