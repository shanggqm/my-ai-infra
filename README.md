# my-ai-infra

个人 AI Coding 资产库与 SDD 项目脚手架。统一维护自己的 Skill、SubAgent、Prompt、Hook、MCP 等资产，在不同项目中选择 Codex、Claude Code、Cursor 或 GitHub Copilot，通过 CLI 或本地 Web 预览并同步配置。

- **按项目选择**：工具和 Skill 可自由组合，已有项目保持自己的配置。
- **规格驱动开发**：10 个内置 Skill，CLI 初始化默认全部安装，其中 7 个组成 SDD 主流程。
- **保留个人内容**：维护受管文件摘要，冲突默认合并，可选择替换或终止，写入前备份，保留已有需求文档。
- **本地运行**：Web 仅监听 `127.0.0.1`，资产保存在本机，无遥测与运行时第三方 npm 依赖。

需要 **Node.js 22+** 和 npm。Git worktree 辅助能力另外需要 Git 与 Bash；其余功能不依赖 Python。当前验证环境为 macOS，Windows / Linux 尚未逐平台完成全部验收。

## 快速开始

全局安装后，进入已经存在的目标仓库运行：

```bash
npm install --global @easyuseai/my-ai-infra@0.0.4
cd /path/to/repo
mai init
mai web
```

`mai init` 和 `mai web` 默认使用命令行所在目录；可用 `--project /path/to/repo` 指定其他项目。原命令 `my-ai-infra` 仍可使用，与 `mai` 共用全部命令和选项。

`mai init` 在终端中展示彩色工具选择、阶段等待动画、文件变更统计与后续操作。`NO_COLOR=1` 关闭配色，`TERM=dumb` 使用静态进度；重定向或脚本调用保留 JSON 输出。

无需全局安装时，在目标仓库运行：

```bash
npx @easyuseai/my-ai-infra@0.0.4 init
npx @easyuseai/my-ai-infra@0.0.4 web
```

从 `0.0.2` 起，初始化使用键盘多选菜单：只需选择工具：↑/↓ 移动、空格多选、Enter 确认，`a` 全选/清空，Esc 或 Ctrl+C 取消。Skill 默认全部安装，无需逐项选择。已有工具偏好默认勾选。`0.0.1` 使用文本输入，升级到 `0.0.2` 可使用新交互。维护者发布流程见[发布指南](docs/releasing.md)。

Web 命令会输出带访问凭证的本机链接。**请使用该链接打开工作台，不要直接打开 `web/index.html`。** 默认进入首页，了解资产复用与 SDD 工作流；点击“配置当前项目”进入工作台。选择工具与 Skill 后，变更预览会在独立弹窗中展示，支持文件搜索、状态筛选和链接目标展开，确认后再应用。

非交互环境显式指定偏好：

```bash
npx --yes @easyuseai/my-ai-infra@0.0.4 init --project /path/to/repo \
  --tools codex,claudecode,cursor,copilot \
  --yes
```

外层 `npx --yes` 同意 npm 获取安装包；内层 `my-ai-infra --yes` 跳过本工具的选择提示。CLI 初始化默认安装全部可用 Skill；已有项目的 sync 保留项目配置。

查看安装版本：

```bash
mai --version
```

## 常用工作流

需求明确时，可使用两条[内置 Prompt 快捷指令](docs/custom-prompts.md)：`my-auto-feature` 连续完成需求、方案、双重评审、修复、实现和测试验收；`my-auto-design` 从明确需求或已有方案开始推进。正文集中在 `.agents/assets/prompts/`，工具入口使用相对软链；Codex 的全局快捷调用与项目文件引用方式见指南。

```bash
# 只读查看文件变更
my-ai-infra plan --project /path/to/repo --tools codex,copilot

# 同步指定项目并检查安装
my-ai-infra sync --project /path/to/repo
my-ai-infra doctor --project /path/to/repo

# 为新项目保存默认偏好
my-ai-infra defaults --tools cursor,copilot

# 导入和修改个人 Skill
my-ai-infra asset import /path/to/my-skill
my-ai-infra asset edit my-skill --file /path/to/SKILL.md
```

没有全局安装时，将上述 `my-ai-infra` 替换为 `npx @easyuseai/my-ai-infra@0.0.4` 即可。所有命令支持 `--help`；`--home PATH` 与 `--home=PATH` 均可用。完整命令、配置与退出码见[使用指南](docs/usage.md)。

## 让 Agent 使用同一个工具

```bash
my-ai-infra setup --tools codex,claudecode,cursor,copilot
```

为所选工具安装全局 `my-ai-infra` 入口 Skill、关联的自定义 Agent 及其依赖 Skill，之后可以说“用 my-ai-infra 给当前项目初始化 SDD”。当前版本默认包含 `architecture-review` 和 `code-review` 两个评审角色。入口调用个人库里的稳定 runtime，不依赖 npx 缓存；同名且被用户修改的全局入口会报告冲突。

## 内置 Skill

| 阶段 | 默认选择 |
|---|---|
| 需求上下文 | [my-create-feature](assets/skills/my-create-feature/SKILL.md) |
| 产品规格 | [my-create-prd](assets/skills/my-create-prd/SKILL.md) |
| 技术方案 | [my-create-design](assets/skills/my-create-design/SKILL.md) |
| 方案审查 | [my-review-design](assets/skills/my-review-design/SKILL.md) |
| 测试规划 | [my-create-test-plan](assets/skills/my-create-test-plan/SKILL.md) |
| 编码实现 | [my-implement-code](assets/skills/my-implement-code/SKILL.md) |
| 代码审查 | [my-review-code](assets/skills/my-review-code/SKILL.md) |

辅助能力：[my-create-memory](assets/skills/my-create-memory/SKILL.md)、[my-create-worktree](assets/skills/my-create-worktree/SKILL.md)、[my-ai-infra](assets/skills/my-ai-infra/SKILL.md)。CLI 初始化包含这些辅助能力；需要缩减 Skill 时可在 Web 中调整，每个项目至少选择一个工具和一个 Skill。

主流程 Skill 会按当前结果给出下一步建议。有阻塞先补缺，完成声明必须关联当前证据，代码评审完成后按项目约定收尾；提示不会替用户批准提交、发布或尚未授权的后续工作。Feature 创建先补齐输入并只读预检，再由随包脚本一次完成编号、骨架、素材归档、索引与校验；成功后直接引导下一步。工作区辅助不会自动共享环境文件或安装依赖。

PRD 面向人工评审与 Coding Agent：以用户故事表、业务流程图和验收标准串联需求，按需补充 UI 功能对照、HTML 原型及文案、枚举、预置数据等研发资源。纯后端和局部文案需求按规模裁剪，已确认内容与既有编号保持稳定。

技术设计与方案评审默认采用 MVP 思维：以最少必要复杂度满足当前需求和硬约束。新增数据结构、抽象、基础设施或治理能力须有当前依据；评审同时检查缺失与过度设计，明确可删除或延后的内容。模板按实际变更裁剪，简单方案无需补齐图表与无关章节。

代码评审按理解契约、识别风险、深入调查、验证证据、收敛结论和交付检查组织，支持 Feature、PR 与独立代码范围，使用 P0/P1/P2 给出合并建议。角色立场由独立的 [code-review Agent](assets/agents/code-review.md) 定义，方法统一引用 `my-review-code`；选中该 Skill 后，安装器自动装配对应角色。四种工具的项目级、用户级目录及调用方法见[自定义 Agent 指南](docs/custom-agents.md)。

## 个人长期记忆

`0.0.4` 支持 Markdown 个人偏好：全局保存到 `<home>/memory.md`，项目保存到 `<home>/projects/<projectId>/memory.md`。稳定项目 ID 随项目配置移动，普通同步保留它；记忆正文留在个人库。

[my-create-memory](assets/skills/my-create-memory/SKILL.md) 遵循宁缺毋滥：临时要求和弱信号跳过，重复偏好合并修订，明确长期表达生效，推断候选等待确认。7 个 SDD Skill 按场景读取，有新证据才条件委派抽取；并发能力由宿主提供，收尾核对实际保存结果。Web“个人记忆”支持编辑、确认、停用、删除和命中预览。详见[个人记忆指南](docs/memory.md)。

## 项目资产与运行规则的边界

`0.0.4` 统一资产布局，升级时迁移旧版受管资产并保留个人修改。

全部 AI 资产统一按类型保存到 `.agents/assets/`，工具原生目录逐文件建立相对软链接。分发包与个人库同样采用 `assets/<类型>/`。详见 [统一资产管理](assets/README.md)。

```text
.agents/assets/skills/<skill>/SKILL.md        # Skill 唯一实体
.agents/assets/agents/<agent>.md             # Agent 唯一可编辑源
.agents/assets/.generated/codex/agents/*.toml # Agent 派生格式
.agents/assets/prompts/<name>.md            # Prompt 一句话编排与描述
.agents/assets/hooks|mcp/<name>/             # 清单与资产正文
.agents/skills/<skill>/SKILL.md -> ../../assets/skills/<skill>/SKILL.md
.claude/skills/<skill>/SKILL.md -> ../../../.agents/assets/skills/<skill>/SKILL.md
.codex/agents/*.toml      -> ../../.agents/assets/.generated/codex/agents/*.toml
.claude/agents/*.md       -> ../../.agents/assets/.generated/claudecode/agents/*.md
```

项目作者维护运行原则、规范与约束，安装器负责集中存放与入口链接，不写入 SDD 流程或共享规则引用。用户通过 prompt 按需发现并执行 Skill。

| 工具 | 项目入口 | 唯一内容源 |
|---|---|---|
| Codex、Cursor | `AGENTS.md` | `.agents/assets/rules/AGENTS.md` |
| Claude Code | `CLAUDE.md` | 新建时复用 `.agents/assets/rules/AGENTS.md`；已有独立正文保存在 `.agents/assets/rules/CLAUDE.md` |
| GitHub Copilot | `.github/copilot-instructions.md` | `.agents/assets/rules/copilot-instructions.md` |

已有入口先备份、迁移原文，再改为相对文件软链接。发现已有 AGENTS.md 和 CLAUDE.md 含不同正文时，即使对应工具未选中也分别归入中心目录，保留各自内容。新建 CLAUDE.md 时，以 AGENTS.md 为唯一内容源，两个根入口都链接到 `.agents/assets/rules/AGENTS.md`；只选 Claude Code 时也创建 AGENTS.md 入口，无独立 CLAUDE.md 副本。先初始化 Codex、后增加 Claude Code，同样复用已有 AGENTS.md。其余缺失规则按所选工具补缺；共享源初始为空时，CLI 与 Web 提示执行对应工具初始化，补全任一入口即可。取消选择工具会移除其受管 Skill 入口，已迁移的项目规则保留。

空规则的初始化提示如下。安装器只展示提示，由用户在目标项目中执行：

- Codex：启动 `codex` 后执行 `/init`，补全 AGENTS.md（[官方命令说明](https://developers.openai.com/codex/cli/slash-commands)）。
- Claude Code：启动 `claude` 后执行 `/init`，补全 CLAUDE.md（[官方命令说明](https://code.claude.com/docs/zh-CN/commands)）。
- Cursor：在 Agent 对话发送“请读取仓库，补全根目录 AGENTS.md 中的项目运行原则、命令和约束”（[规则支持](https://cursor.com/docs/context/rules)）。
- Copilot：执行 `copilot init`，或在 CLI 会话执行 `/init`（[官方命令说明](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)）。

文件已存在时，可让对应工具补全已有内容。新建的 AGENTS.md 与 CLAUDE.md 共用源，Codex、Cursor、Claude Code 可选一个生成原则；原有独立规则保持独立。通过现有链接写入后内容立即集中生效；如果初始化工具将空链接替换成普通文件，执行 `my-ai-infra sync --project .` 重新归入中心目录。已有两份不同的非空内容时，先合并差异后再同步。

| 已有内容 | 初始化策略 |
|---|---|
| 项目运行规则 | 原文分别归入 `.agents/assets/rules/`，入口链接；正文由项目维护 |
| `.gitignore` | 只补缺少的条目，保留注释、顺序、换行及显式反向规则，重复执行不重复插入 |
| `mai-specs/` 项目文档 | 只补缺失文件，保留已有正文 |
| 同名 Skill/Agent 或被改指向的链接 | 全面预检后选择 merge / replace / 终止，默认 merge；保留恢复记录 |
| 旧版自动生成的 SDD 片段 | 仅在公开版本摘要或安装记录可确认未修改时备份后清理；无法确认的内容保留并提示 |

旧版共享源含有人类项目规则时，先保留原文并迁移到各入口的独立中心文件，再移除旧源；只有已确认未修改的 SDD 片段会被清理。未知目录链接在 merge 下保持现场并跳过相关路径，replace 仅替换入口，目标保持不变。规则和 Skill 均使用相对链接，整体移动项目仍有效。Windows 需要文件软链接权限，权限不足时明确报错并回滚。

## 初始化冲突处理

`init` / `sync` 会在写入前集中检查计划安装和移除的路径，包括 Skill / Agent、运行规则、父目录类型、文件链接、配置、安装记录与忽略标记。无关文件保持原状。交互终端发现冲突时用方向键选择处理方式，Enter 默认选择 merge；完成后显示简短摘要与恢复目录。`--yes` 和非交互命令直接采用默认策略，非交互输出保持 JSON。Web 提供相同策略，并要求重新预览后应用。

| 策略 | 行为 |
|---|---|
| `merge`（默认） | 补缺，保留同名本地文本；多工具 Skill 副本集中到 `.agents`，优先已有中心内容，否则采用首个本地副本。不同版本保存为合并候选，不直接拼接脚本、YAML 或运行约束。 |
| `replace` | 先备份，再使用待安装内容；目录和二进制占位也会归档，外部链接仅更换链接入口，不修改目标。 |
| `abort` | 有冲突时终止，项目保持原状。 |

```bash
my-ai-infra init --project . --conflict merge
my-ai-infra sync --project . --conflict replace
my-ai-infra plan --project . --conflict abort
```

成功结果的 `recovery` 给出恢复目录，通常为 `.my-ai-infra/backups/<操作ID>/`。其中 `before/` 保留原文件、二进制与链接，`incoming/` 和 `local/` 保存不同版本，`journal.json` 记录变更。目录占位整体移入备份，失败时恢复；状态目录本身被占用时采用项目内独立的 `.my-ai-infra-recovery-<操作ID>/`。

merge 保留的本地资产继续受到保护，后续普通同步沿用它；需要明确采用分发版本时使用 replace。`review` 列出需要人工核对的差异。不能安全处理的父目录链接或不可读路径保留并列入 `skipped`，其他配置继续装配；此时 `complete: false`、CLI 退出 2，Web 明确显示部分完成。正确指向 `.agents` 的 Skill 目录链接可直接复用。核心 API 保留默认 abort，CLI 与 Web 的默认策略为 merge。

## 数据放在哪里

```text
~/.my-ai-infra/
├── assets/                 按类型保存 Skill、Agent、Prompt、Hook、MCP 等资产
├── memory.md               跨项目个人偏好（按需创建）
├── projects/<projectId>/   项目信息与 memory.md（按需创建）
├── defaults.json           新项目默认选择
├── bundle-state.json       内置文件基线，用于保留个人修改
├── projects.json           已初始化项目索引
├── runtime/                稳定 CLI / Web
└── backups/                修改与升级前的恢复副本

目标项目/
├── .my-ai-infra.json        项目偏好
├── .my-ai-infra/            安装状态与备份，自动忽略
├── .agents/assets/rules/          项目运行规则实体，分别维护
├── .agents/assets/        全部 AI 资产实体与派生格式
├── .agents/skills/        Codex Skill 入口链接
├── AGENTS.md / CLAUDE.md    已有或所选工具的规则入口软链接
└── mai-specs/              SDD 规格与 Feature 交付记录
```

`mai-specs/` 是项目的 SDD 工作区。`init` / `sync` 写入工作区说明、ROADMAP、路径契约及 PRD / 设计 / 测试计划模板；`my-create-feature` 在其中创建具体需求；编号由脚本从 999 递减并循环，跳过占号，目录与 ID 省略 Feature- 前缀。AI 使用脚本返回的实际路径，冲突时保留现场并让用户选择。所有内置流程统一使用此目录，不查找或回退到其他根目录。

个人目录可通过 `MY_AI_INFRA_HOME` 或 `--home` 指定。项目 Skill 安装到 `.agents/skills/`、`.claude/skills/`、`.cursor/skills/` 或 `.github/skills/`；个人入口使用对应目录，Copilot 使用 `~/.copilot/skills/`。

## 升级

```bash
npx --yes @easyuseai/my-ai-infra@latest upgrade
npx --yes @easyuseai/my-ai-infra@latest plan --project /path/to/repo
npx --yes @easyuseai/my-ai-infra@latest sync --project /path/to/repo
```

`upgrade` 更新本地 runtime，并备份、更新有基线且未修改的内置文件。个人修改和没有可信基线的旧文件保留；新内置资产加入可选清单，已有默认选择仅剔除明确退役的 Skill。项目副本需要显式 `sync`，升级后请重启正在运行的 Web。升级及回滚说明见[使用指南](docs/usage.md#升级与恢复)。

`0.0.3` 移除 `my-verify-feature`，主流程在代码审查后按项目约定收尾。旧默认和项目选择会剔除该项；`sync` 仅清理未修改的受管副本，遇到修改时报告冲突。个人库中的旧文件、已有 Feature 路径契约和验收报告保留。若旧配置仅选择该项，请通过 `--skills` 或 Web 重新选择可用 Skill。

## 安全边界与支持范围

`plan` / `--dry-run` 只读；同步整体检查冲突，应用失败时回滚本次已写项目文件。进程被强制结束或断电时，可用备份和 journal 手工恢复。目标项目的受管副本被修改时不会直接覆盖。

自定义 Skill 目前支持 UTF-8 文本及附属脚本/引用，二进制导入会明确报错。内置 Logo 和字体独立分发。Skill 是可执行指引，导入前应阅读其内容及脚本；工具不会自动执行导入的脚本。无团队审批、远程资产市场或跨项目自动升级。文件装配验收不代表四种商业工具上的模型行为都已完成验证。

遇到端口占用、失效链接、文件冲突、锁残留或直接打开 HTML 等问题，见[故障排查](docs/troubleshooting.md)。

## 开发与发布

源码中的 `src/`、`bin/`、`web/` 分别负责装配、CLI 与配置界面；`assets/` 保存按类型组织的 AI 资产，`templates/` 保存规格模板，`catalog/` 保存登记信息。`design-system/` 保存 adaptive 工作台与 landing 首页共用的设计契约和 tokens，Web 实际消费 CSS 变量与自托管图标。

```bash
npm ci
npm run verify
npm run release:check
```

发布检查先检查 `assets/skills/` 中的唯一源、代码与资源，再运行测试，并验证实际 `.tgz` 的安装与 Web。产物和摘要写入忽略的 `dist/`。源码开发约定与发布步骤见[文档目录](docs/README.md)和[版本记录](CHANGELOG.md)。源码维护于私有仓库 [shanggqm/my-ai-infra](https://github.com/shanggqm/my-ai-infra)。

本项目可独立克隆，也作为课程仓库 `learner-kit/code/my-ai-infra/` 下的 submodule 开发。所有 Skill 实体统一维护于本仓库 `assets/skills/`，课程 `.agents/skills/` 中的三个入口使用相对目录软链。代码变更在本仓库的开发分支提交并推送，再由课程仓库提交子模块版本指针；课程文件与本项目源码分别维护。历史课程仓库中的审查记录仅说明当时状态，不定义当前资产归属。

本项目采用 [MIT 许可证](LICENSE)。来源登记和字体 Apache 2.0 许可说明见[第三方与资产来源](THIRD_PARTY_NOTICES.md)。实际公开发布前需确认负责人提供的复制资产授权范围。
