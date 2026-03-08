# 🦞 龙虾 OpenClaw Manager 小白版

一个面向非技术用户的 OpenClaw 本地可视化管理台。  
A beginner-friendly local control panel for OpenClaw.

**当前版本 / Current Version:** `0.0.11`  
**更新记录 / Changelog:** [CHANGELOG.md](/Users/admin/Documents/Playground/openclaw-manager/CHANGELOG.md)

**快速导航**

- [中文说明](#zh-guide)
- [English Guide](#english-guide)
- [版本管理与升级](#版本管理与升级)
- [Versioning and Upgrades](#versioning-and-upgrades)
- [原项目与致谢](#zh-credits)
- [Original Project and Credits](#original-project-and-credits)

<a id="zh-guide"></a>

## 中文说明

### 这份文档解决什么问题

这份文档主要回答 4 个问题：

1. 这个项目到底有什么用。
2. 它和 `OpenClaw`、`skill` 分别是什么关系。
3. 非技术用户应该怎么安装、怎么第一次配置。
4. 它的优点、局限和使用注意事项是什么。

更具体一点，这个提交主要是在解决一类非常常见的问题：

- 很多人把 OpenClaw 装上了，但不知道服务应该怎么启动
- 知道能接模型，但不清楚默认模型、Provider 和 key 应该怎么配
- 想继续往前走时，又会卡在渠道、记忆、定时任务这些进阶管理上

这版整理的目标，就是把这些最容易卡住小白的步骤收口成一个更容易理解的网页管理流程，尽量降低第一次上手和日常维护的门槛。

但也要说清楚：

它做的是“降低门槛”，不是“替你完成探索”。  
OpenClaw 还是需要你持续摸索自己的工作流、模型组合和记忆策略；如果只是图一时新鲜，没有逐步打磨成稳定用法，最后很难真正变成生产力。

### 这是什么

`🦞 龙虾 OpenClaw Manager 小白版` 不是新的模型，也不是 OpenClaw 的替代品。  
它是一个本地管理台，用网页或桌面界面把 OpenClaw 常见的命令行操作做成了可视化流程。

你可以用它来：

- 查看 OpenClaw 是否在线、端口是否正常、日志是否异常
- 配置 AI Provider、默认模型、渠道权限和定时任务
- 给定时任务单独挂飞书、钉钉这类单向通知渠道，用来收结果摘要
- 用中文表单管理 Telegram、Discord、Slack、飞书、WhatsApp 等渠道
- 管理候选记忆、长期记忆和记忆效率指标
- 查看 token、对话使用情况和最近会话状态

### 它是怎么实现的

实现方式很简单：

1. `OpenClaw` 负责真正的运行能力  
   模型调用、会话、渠道、记忆、定时任务都在这里生效。
2. `Manager` 负责可视化控制  
   把配置、检查、诊断和操作变成页面按钮和表单。
3. `skill` 负责“AI 知道怎么做”  
   它让 AI 更会解释、更会排查，但不等于本机 runtime 已经自动装好。

一句话：

- `OpenClaw` 是引擎
- `Manager` 是控制台
- `skill` 是操作知识

### 和原项目的区别

这版不是否定原项目，而是在原项目基础上做了更偏“小白可用”的整理。

主要区别是：

- `网页优先`：这版把本地网页管理台作为默认入口，普通用户优先用浏览器，不需要先理解桌面开发流程
- `中文说明更完整`：安装、配置、注意事项、记忆和渠道都按非技术用户语言重写
- `安装引导前置`：环境未就绪时先进入引导，而不是要求用户先去命令行自己排查
- `功能面更收口`：把模型、渠道、记忆、定时任务、用量放到一个更直接的日常入口
- `单向通知更清晰`：定时任务现在可以单独挂飞书、钉钉通知，不必强行复用会话渠道
- `记忆效率可观察`：不只是展示记忆条目，还增加了真实注入、相关命中、潜在 token 节省等指标
- `本地部署更直接`：当前主路径是本地网页管理，不强迫用户从源码跑桌面端

也要客观看待：

- 这版更强调“本地网页管理体验”
- 原项目在桌面端形态和原始结构上更原生
- 如果你本来就是桌面开发用户，原项目路径会更直接

### 这个方案的优点

- 对非技术用户友好，不需要长期依赖命令行
- 配置更集中，模型、渠道、记忆、定时任务都在一个入口
- 定时任务和通知渠道拆得更清楚，适合“任务执行后推送到指定地方”这类场景
- 适合帮别人代管 OpenClaw，例如团队成员、家人、运营同事
- 支持把复杂配置做成中文界面，减少 JSON 和 CLI 误操作
- 可以看到记忆相关的效率指标，不只是“存了几条记忆”

### 这个方案的局限和缺点

- 它依赖 OpenClaw，本身不是独立运行时
- 如果只装 `skill`，用户看到的是“AI 会解释”，不是“本机能力已经就绪”
- 网页管理台默认是本地使用，不是直接面向公网的 SaaS
- 如果使用桌面开发模式，仍然需要 Node.js，开发桌面版时还需要 Rust / Tauri
- 某些底层能力仍然来自 OpenClaw 原生逻辑，Manager 只是更易用的外层
- 飞书、钉钉的单向通知当前发送的是执行摘要；短信、电话还只是规划位，尚未接入供应商

### 最适合谁

- 不想长期使用命令行的人
- 已经会安装 OpenClaw，但不想手改配置文件的人
- 需要替别人维护 OpenClaw 的同事或运营
- 想保留 CLI 能力，但希望日常配置更轻松的人

### 安装前先了解

- 这个项目依赖 `OpenClaw`，不替代 OpenClaw 本体
- 网页管理台默认只监听本机
- AI 模型、渠道、定时任务都会消耗你自己的 key、token 和模型额度
- 普通网页使用通常不需要 Rust；只有桌面开发模式才需要 Rust / Tauri

### 一键安装与配置怎么做

对大多数用户，推荐路径是“先装 OpenClaw，再打开 Manager 做第一次引导”。

1. 克隆仓库并安装依赖

```bash
git clone https://github.com/lanceelotll-bot/lobster-openclaw-manager-beginner.git
cd lobster-openclaw-manager-beginner
npm install
```

2. 启动本地网页管理台

```bash
npm run web:prod
```

3. 打开页面

```text
http://127.0.0.1:18888/
```

4. 按页面顺序完成首次配置

- 先检查环境是否就绪
- 如果缺依赖，按安装引导补齐 Node.js 和 OpenClaw
- 进入 `AI 配置`，填入 Provider 和 API Key
- 进入 `渠道`，配置 Telegram、飞书、Discord 等
- 回到 `概览`，确认在线状态、日志和用量是否正常
- 需要自动化时再进入 `定时任务`
- 需要长期偏好和记忆管理时进入 `记忆中心`

<a id="版本管理与升级"></a>

### 版本管理与升级

现在开始，这个项目默认采用简单的语义化版本管理：

- 每次对外可感知的更新，至少递增一个版本号
- 日常改进默认走 `patch`
- 功能明显扩展可以走 `minor`
- 如果以后出现不兼容调整，再考虑 `major`

常用命令：

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

这些命令会同步更新：

- [package.json](/Users/admin/Documents/Playground/openclaw-manager/package.json)
- [package-lock.json](/Users/admin/Documents/Playground/openclaw-manager/package-lock.json)
- [src-tauri/tauri.conf.json](/Users/admin/Documents/Playground/openclaw-manager/src-tauri/tauri.conf.json)
- [src-tauri/Cargo.toml](/Users/admin/Documents/Playground/openclaw-manager/src-tauri/Cargo.toml)
- [app-meta.ts](/Users/admin/Documents/Playground/openclaw-manager/src/lib/app-meta.ts)

升级前后建议查看：

- [CHANGELOG.md](/Users/admin/Documents/Playground/openclaw-manager/CHANGELOG.md)

如果你是普通使用者，升级通常按这个顺序：

```bash
git pull
npm install
npm run web:build
launchctl kickstart -k gui/$(id -u)/com.openclaw.manager.web
```

### 使用中的两个常见误区

**误区 1：装了 skill 就等于功能都有了**

不是。  
装 `skill` 只是让 AI 更懂这套系统，不代表网页、服务、自启、记忆后端和渠道都已经跑起来。

**误区 2：看到页面就等于能力已经生效**

也不是。  
真正生效要看本机 runtime 是否正常，尤其是：

- OpenClaw 是否安装
- gateway 是否在线
- key / token 是否已配置
- 渠道和定时任务是否真的启用

### 记忆中心能解决什么

`记忆中心` 不只是“存记忆”，还帮助判断这套记忆机制有没有效率。

当前页面会区分三类信息：

- `真实注入`：某次会话是否真的把 `MEMORY.md` 等提示内容注入到了 prompt
- `相关命中`：最近话题是否经常和长期记忆相关
- `潜在 token 节省`：如果改成按需注入，理论上还能少加载多少 token

这些指标的作用不是制造一个“神秘命中率”，而是帮助你判断：

- 记忆是否太重
- 记忆是否经常被实际话题触发
- 有没有继续精简或重组的价值

### 当前常用本地入口

- 网页管理台：`http://127.0.0.1:18888/`
- OpenClaw 原始控制台：`http://127.0.0.1:18789/`

### 注意事项

- 不要把网页管理台默认当作公网服务直接开放出去
- 不要把 API Key 和 Bot Token 直接提交到 Git
- 如果要给别人使用，优先提供“管理台 + 运行时”的完整交付，而不是只发一个 skill
- 如果你只想做稳定日常使用，优先走网页管理台，不建议普通用户从源码跑桌面开发版

<a id="zh-credits"></a>

## 原项目与致谢

这个项目基于原始 OpenClaw Manager 思路继续整理和扩展。  
感谢原作者与所有贡献者。

- 原项目地址：[https://github.com/miaoxworld/openclaw-manager](https://github.com/miaoxworld/openclaw-manager)

<a id="english-guide"></a>

## English Guide

### What This Document Helps You Understand

This guide answers four practical questions:

1. What problem this project solves.
2. How it relates to `OpenClaw` and `skill`.
3. How non-technical users should install and configure it.
4. What the main strengths, tradeoffs, and caveats are.

More concretely, this work is aimed at a very common failure point:

- many people install OpenClaw but do not know how to actually start the service
- they know models are supported, but do not know how to configure providers, keys, and the default model
- once they move past the basics, they get stuck on channels, memory, and scheduled tasks

This version tries to turn those rough edges into a clearer web-first management flow, so the first setup and daily maintenance are easier for beginners.

It is also important to frame it honestly:

this project lowers the barrier, but it does not replace exploration.  
OpenClaw still becomes valuable only when you keep refining your workflow, model choices, and memory strategy. If it stays at the level of novelty, it usually does not become real productivity.

### What It Is

`🦞 Lobster OpenClaw Manager for Beginners` is not a new model and it does not replace OpenClaw.  
It is a local control panel that turns common OpenClaw CLI workflows into a visual interface.

You can use it to:

- check whether OpenClaw is online and healthy
- configure AI providers, default models, channels, and cron jobs
- attach one-way notification targets such as Feishu or DingTalk to cron jobs for summary delivery
- manage Telegram, Discord, Slack, Feishu, WhatsApp, and other channels with forms instead of manual JSON edits
- manage candidate memory, durable memory, and memory-efficiency telemetry
- review token usage, session usage, and recent system status

### How It Works

The model is straightforward:

1. `OpenClaw` provides the real runtime  
   models, sessions, channels, memory, and cron all run there.
2. `Manager` provides the control surface  
   configuration, checks, diagnostics, and actions are exposed through the UI.
3. `skill` provides operational knowledge  
   it helps the AI explain and troubleshoot the system, but it does not install the runtime by itself.

In short:

- `OpenClaw` is the engine
- `Manager` is the control panel
- `skill` is the operational know-how

### How This Differs from the Original Project

This version is not meant to replace or diminish the original project. It is a beginner-focused, web-first refinement built on top of that direction.

The main differences are:

- `Web-first workflow`: the local web manager is treated as the primary entry point, so normal users can start from a browser instead of a desktop dev workflow
- `More complete beginner-facing documentation`: installation, setup, memory, channels, and caveats are rewritten in clearer language
- `Front-loaded setup guidance`: if the environment is not ready, the UI leads with guided setup instead of expecting early CLI troubleshooting
- `More opinionated daily operations`: models, channels, memory, cron, and usage are grouped into a tighter everyday control surface
- `Clearer one-way notifications`: cron jobs can send summaries to Feishu or DingTalk without turning those targets into full chat channels
- `Observable memory efficiency`: this version adds real injections, related hits, and potential token-savings telemetry instead of only showing stored memory entries
- `More direct local deployment`: the primary path is local web management, not asking normal users to run the desktop app from source

It is still important to frame this correctly:

- this version is more focused on local web usability
- the original project is closer to the native desktop-oriented structure
- if you are primarily a desktop developer, the original path may still feel more direct

### Strengths

- Friendly for non-technical users
- Centralized management for models, channels, memory, usage, and cron
- Separates cron notifications from chat channels for simpler one-way delivery workflows
- Good for operators who maintain OpenClaw for someone else
- Reduces risky manual JSON and CLI edits
- Adds observable memory-efficiency signals instead of only showing stored records

### Tradeoffs and Limitations

- It depends on OpenClaw and is not a standalone runtime
- Installing only the `skill` does not mean the runtime is active
- The web manager is local-first by default, not a public SaaS panel
- Desktop development mode still needs Node.js, and desktop development also needs Rust / Tauri
- Some lower-level behavior still comes from native OpenClaw logic; the Manager mainly improves usability
- Feishu and DingTalk one-way notifications currently send execution summaries; SMS and phone integrations are planned but not implemented yet

### Who It Is For

- People who do not want to live in the command line
- Users who can install OpenClaw but do not want to hand-edit config files
- Operators or teammates who maintain OpenClaw for others
- People who want to keep CLI power but prefer a simpler daily workflow

### Before You Install

- This project depends on `OpenClaw`; it does not replace it
- The web manager listens locally by default
- Models, channels, and cron jobs consume your own keys, tokens, and provider quotas
- Normal web usage usually does not need Rust; Rust / Tauri are mainly for desktop development mode

### Recommended Install and Setup Path

For most users, the right path is: install OpenClaw first, then use the Manager for guided setup.

1. Clone the repo and install dependencies

```bash
git clone https://github.com/lanceelotll-bot/lobster-openclaw-manager-beginner.git
cd lobster-openclaw-manager-beginner
npm install
```

2. Start the local web manager

```bash
npm run web:prod
```

3. Open the UI

```text
http://127.0.0.1:18888/
```

4. Complete first-time setup in this order

- check environment readiness
- install Node.js and OpenClaw if the wizard says they are missing
- open `AI Config` and add provider keys
- open `Channels` and configure Telegram, Feishu, Discord, or other channels
- return to `Dashboard` and confirm health, logs, and usage
- open `Cron` only if you need automation
- open `Memory Center` if you need durable preferences and memory review

<a id="versioning-and-upgrades"></a>

### Versioning and Upgrades

From this point on, the project follows a simple semantic-versioning workflow:

- every user-visible release should increment the version
- regular updates should usually bump `patch`
- larger feature additions can bump `minor`
- only incompatible changes should require a `major` bump

Common commands:

```bash
npm run version:patch
npm run version:minor
npm run version:major
```

These commands keep the main version files in sync:

- [package.json](/Users/admin/Documents/Playground/openclaw-manager/package.json)
- [package-lock.json](/Users/admin/Documents/Playground/openclaw-manager/package-lock.json)
- [src-tauri/tauri.conf.json](/Users/admin/Documents/Playground/openclaw-manager/src-tauri/tauri.conf.json)
- [src-tauri/Cargo.toml](/Users/admin/Documents/Playground/openclaw-manager/src-tauri/Cargo.toml)
- [app-meta.ts](/Users/admin/Documents/Playground/openclaw-manager/src/lib/app-meta.ts)

Before or after upgrading, check:

- [CHANGELOG.md](/Users/admin/Documents/Playground/openclaw-manager/CHANGELOG.md)

For normal users, upgrades should usually follow this order:

```bash
git pull
npm install
npm run web:build
launchctl kickstart -k gui/$(id -u)/com.openclaw.manager.web
```

### Two Common Misunderstandings

**Misunderstanding 1: Installing the skill means everything is ready**

It does not.  
The skill only helps the AI understand the workflow. It does not automatically install the UI, services, startup jobs, memory backend, or channels.

**Misunderstanding 2: Seeing the UI means the capability is already active**

Also false.  
The capability is only real if the runtime is healthy, especially:

- OpenClaw is installed
- gateway is online
- keys and tokens are configured
- channels and cron jobs are actually enabled

### What the Memory Center Is For

The `Memory Center` is not just a storage screen. It helps you judge whether the memory strategy is efficient.

The UI separates three kinds of signals:

- `Real injections`: whether `MEMORY.md` and related prompt content were truly injected into a session prompt
- `Related hits`: whether recent conversations repeatedly touch durable memories
- `Potential token savings`: how many prompt tokens might be avoided in a more selective memory-loading strategy

These metrics are meant to answer practical questions:

- is memory too heavy
- is memory actually relevant
- is it worth simplifying or reorganizing the memory layout

### Local Entry Points

- Web manager: `http://127.0.0.1:18888/`
- Original OpenClaw console: `http://127.0.0.1:18789/`

### Practical Notes

- Do not expose the local manager directly to the public internet by default
- Do not commit live API keys or bot tokens into Git
- If you are distributing this to others, ship the manager together with the runtime instead of shipping only a skill
- For stable daily usage, prefer the web manager over running the desktop app from source

<a id="original-project-and-credits"></a>

## Original Project and Credits

This project continues and extends the original OpenClaw Manager direction.  
Thanks to the original author and all contributors.

- Original project: [https://github.com/miaoxworld/openclaw-manager](https://github.com/miaoxworld/openclaw-manager)
