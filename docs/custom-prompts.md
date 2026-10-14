# 自定义 Prompt 快捷指令

内置两条连续开发指令，面向需求已明确、希望 Agent 自主推进的任务：

| 指令 | 用法 |
|---|---|
| `my-auto-feature` | 从目标开始，自主整理 Feature 与 PRD，完成技术方案、方案 review 与修复、实现、代码 review 与修复、测试验收 |
| `my-auto-design` | 从明确需求、PRD 或已有技术方案开始；已有方案直接 review，否则先编写方案，再修复、实现、代码 review 与修复、测试验收 |

正文唯一来源见 [Prompt 资产目录](../assets/prompts/README.md)。每条正文仅用一句话编排已安装的 SDD Skill，具体执行规则由各 Skill 维护。默认初始化包含这些 Skill；手工缩减过选择时，应先补齐流程所需 Skill。

## 安装与同步

使用包含这两个资产的版本，在目标项目执行：

```bash
mai init --project /path/to/repo --tools codex,claudecode,cursor,copilot --yes
# 已初始化项目
mai sync --project /path/to/repo
mai doctor --project /path/to/repo
mai asset list --type prompts
```

源码开发时将 `mai` 替换为本包的 `node bin/my-ai-infra.mjs`，并传入目标项目绝对路径。`init` / `sync` 自动包含适用于所选工具的 Prompt，无需另行复制文件。个人库升级、冲突、备份、编辑沿用[统一资产管理](../assets/README.md)。

目标项目中的所有入口均指向同一正文，以 `my-auto-feature` 为例：

```text
.agents/assets/prompts/my-auto-feature.md  # 唯一可编辑正文
.codex/prompts/my-auto-feature.md -> ../../.agents/assets/prompts/my-auto-feature.md
.claude/commands/my-auto-feature.md -> ../../.agents/assets/prompts/my-auto-feature.md
.cursor/commands/my-auto-feature.md -> ../../.agents/assets/prompts/my-auto-feature.md
.github/prompts/my-auto-feature.prompt.md -> ../../.agents/assets/prompts/my-auto-feature.md
```

项目定制直接编辑中心正文，所有入口即时读取同一文件；宿主已缓存时需开启新会话。整体移动项目后相对链接仍有效。分发源、个人库与项目之间通过显式同步传递版本，各项目可保留定制；“唯一源”指每个安装作用域内各工具共用一份正文。

## 在工具中调用

| 工具 | 项目入口 | 调用方式 |
|---|---|---|
| Claude Code | `.claude/commands/<名称>.md` | `/my-auto-feature 需求描述` 或 `/my-auto-design 方案路径` |
| Cursor | `.cursor/commands/<名称>.md` | 支持 commands 的版本使用 `/my-auto-feature` 或 `/my-auto-design`；未显示时显式引用项目 Prompt 文件 |
| GitHub Copilot（支持 Prompt files 的 IDE） | `.github/prompts/<名称>.prompt.md` | 在 Agent 模式选择 `/my-auto-feature` 或 `/my-auto-design`，在同条消息补充任务或附加材料 |
| Codex | `.codex/prompts/<名称>.md` | 项目入口用于显式文件引用；全局安装后，支持 custom prompts 的 CLI / IDE 使用 `/prompts:my-auto-feature` 或 `/prompts:my-auto-design` |

Codex 的 custom prompts 已弃用，官方文档规定从用户级 Codex home 加载，项目 `.codex/prompts/` 不会自动注册斜杠命令。需要兼容旧快捷入口时，运行 `mai setup --tools codex`，默认写入 `~/.codex/prompts/` 并软链到 `~/.agents/assets/prompts/`，随后重启会话。当前安装器使用默认工具主目录；自定义 `CODEX_HOME` 的用户可直接引用项目 Prompt。依据：[OpenAI 官方说明](https://learn.chatgpt.com/docs/custom-prompts)。

Claude Code 仍兼容 commands 文件；Cursor 官方提供 commands 到 skills 的迁移入口；Copilot 的 Prompt files 支持范围与 CLI 有区别，本包不创建未经验证的全局 Copilot Prompt 入口。依据：[Claude Code](https://code.claude.com/docs/en/skills)、[Cursor](https://cursor.com/help/customization/skills)、[GitHub Copilot](https://docs.github.com/en/copilot/tutorials/customization-library/prompt-files/your-first-prompt-file)。这些格式正在演进；安装测试验证文件装配，宿主菜单识别及模型行为需在实际客户端复核。

跨工具通用调用示例：

```text
请读取并执行 .agents/assets/prompts/my-auto-feature.md。
本次目标：为现有任务列表增加按负责人筛选，沿用当前权限与分页约定。

请读取并执行 .agents/assets/prompts/my-auto-design.md。
本次方案：mai-specs/997/design/TECH_DESIGN.md。完成评审修复、实现与验收。
```

需求描述或方案路径放在同条消息或当前对话中。项目内定制应通过项目文件引用调用，避免全局快捷入口读取另一份作用域的版本。

## 修改个人资产

新增 Prompt 只需一个 Markdown 文件，文件名使用小写字母、数字和连字符，frontmatter 提供单行 `description`；无需单独目录或 `asset.json`。工具入口位置由安装器统一映射。

```bash
mai asset import /path/to/my-shortcut.md --type prompts
mai asset edit my-auto-feature --type prompts --file /path/to/prompt.md
mai sync --project /path/to/repo
# 更新此前显式安装的全局入口
mai setup --tools codex,claudecode,cursor
```

Web 的资产列表也可编辑 Prompt 正文。同步遇到项目定制按 merge / replace / abort 处理；默认保留本地内容并保存候选。不要把各工具入口替换为独立副本。已有清单式个人 Prompt 保持兼容，同名新文件不会覆盖它；同一目录中的新旧同名资产会报冲突，需保留一个源。
