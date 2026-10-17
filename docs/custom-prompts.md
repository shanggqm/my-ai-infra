# 自定义 Prompt 快捷指令

内置三条指令，覆盖连续开发与仓库记忆初始化：

| 指令 | 用法 |
|---|---|
| `my-auto-feature` | 从目标开始，自主整理 Feature 与 PRD，完成技术方案、方案 review 与修复、实现、代码 review 与修复、测试验收 |
| `my-auto-design` | 从明确需求、PRD 或已有技术方案开始；已有方案直接 review，否则先编写方案，再修复、实现、代码 review 与修复、测试验收 |
| `my-init-repo-memory` | 无需参数，依据当前仓库事实直接生成或精简优化根目录 `AGENTS.md`，保留有效约束并交付差异 |

正文唯一来源见 [Prompt 资产目录](../assets/prompts/README.md)。前两条指令用一句话编排已安装的 SDD Skill，具体执行规则由各 Skill 维护。默认初始化包含这些 Skill；手工缩减过选择时，应先补齐流程所需 Skill。`my-init-repo-memory` 自带事实提炼与文件编辑规则，无需其他 Skill。

`my-init-repo-memory` 核实仓库事实并维护开发入口、规则和验证要求。知识与参考聚焦重要且稳定的仓库级规范与业务领域知识，不列 SDD 需求文档；按实际内容裁剪章节。已有明确要求、未提交修改与软链接保持，普通信息缺失时查证或省略，关键冲突再询问。个人偏好由 `my-create-memory` 维护。

## 安装与同步

使用包含这些资产的版本，在目标项目执行：

```bash
mai init --project /path/to/repo --tools codex,claudecode,cursor,copilot --yes
# 已初始化项目
mai sync --project /path/to/repo
mai doctor --project /path/to/repo
mai asset list --type prompts
```

源码开发时将 `mai` 替换为本包的 `node bin/my-ai-infra.mjs`，并传入目标项目绝对路径。`init` / `sync` 自动包含适用于所选工具的 Prompt，无需另行复制文件。个人库升级、冲突、备份、编辑沿用[统一资产管理](../assets/README.md)。

目标项目保存一份可编辑正文，并由安装器生成原生入口：

```text
.agents/prompts/my-auto-feature.md             # 唯一可编辑正文
.agents/skills/my-auto-feature/SKILL.md         # 生成的 Skill 入口，引用正文
.agents/skills/my-auto-feature/agents/openai.yaml
.claude/skills/my-auto-feature/SKILL.md -> ../../../.agents/skills/my-auto-feature/SKILL.md
```

ChatGPT/Codex、Cursor 与 VS Code Copilot 共用 `.agents/skills`，Claude Code 使用链接到共享入口的 Skill。生成入口只描述如何读取正文；修改流程请编辑 `.agents/prompts`，保留生成入口。整体移动项目后相对引用仍有效。每个安装作用域维护自己的正文，项目定制由同步冲突策略保护。

## 在工具中调用

| 工具 | Prompt 入口 | 调用方式 |
|---|---|---|
| ChatGPT 桌面项目 | `.agents/skills/<名称>/SKILL.md` | 输入 `@` 选择名称 |
| Codex CLI / IDE | 同上 | `$my-auto-feature` 或 `/skills` 选择 |
| Claude Code | `.claude/skills/<名称>/SKILL.md` | `/my-auto-feature` |
| Cursor IDE | `.agents/skills/<名称>/SKILL.md` | `/my-auto-feature`，也可用 `@` 附加 |
| VS Code GitHub Copilot | `.agents/skills/<名称>/SKILL.md` | `/my-auto-feature` |

另外两条指令使用对应名称，需求描述或方案路径放在同条消息。原生入口能力随客户端版本变化；安装后刷新或开启新会话，先检查项目是否为当前工作目录。ChatGPT 界面的具体选择符以当前客户端为准。上述映射依据 [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills)、[Claude Code Skills](https://code.claude.com/docs/en/skills)、[Cursor Skills](https://cursor.com/help/customization/skills)、[VS Code Skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)。

Prompt 入口以显式调用为用途；生成 Skill 设置 `disable-model-invocation: true`，Codex 配套设置 `allow_implicit_invocation: false`。当前会话内容传递给原流程，不替换成其他项目或全局的同名正文。全局 setup 使用 `~/.agents` 的同一结构；项目 init 无需依赖全局 setup 或旧 Codex custom prompts。

`sync` 将受管的旧 `.codex/prompts`、`.claude/commands`、`.cursor/commands`、`.github/prompts` 入口迁移到上述布局；旧清单式 Prompt 继续按工具键限定适用范围，其路径由原生适配器生成。修改过的旧文件按冲突策略保留或备份，未受管文件保持原状。global setup 校验受管旧链接再备份移除，遇到用户替换内容停止。残留的用户自建同名命令需要自行比较后处理。

`mai doctor` 的 `discovery` 列出资产入口和调用方式，`ready` 仅表示入口文件就绪，`hostVerified: false` 表示该诊断没有执行宿主验证。`planned` 是预览中待安装，`needs-sync` 是缺失/冲突/依赖阻塞，`configuration-required` 表示仍需宿主配置，`unsupported` 表示资产没有声明该工具适配。Hook/MCP 保持原生事件、注册和权限语义，复制文件不会自动激活。

跨工具通用调用示例：

```text
请读取并执行 .agents/prompts/my-init-repo-memory.md。

请读取并执行 .agents/prompts/my-auto-feature.md。
本次目标：为现有任务列表增加按负责人筛选，沿用当前权限与分页约定。

请读取并执行 .agents/prompts/my-auto-design.md。
本次方案：mai-specs/997/design/TECH_DESIGN.md。完成评审修复、实现与验收。
```

需求描述或方案路径放在同条消息或当前对话中。项目内定制应通过项目文件引用调用，避免全局快捷入口读取另一份作用域的版本。

仓库记忆初始化无需额外输入。在支持上表快捷入口的宿主中，将命令名替换为 `my-init-repo-memory` 即可；也可以直接引用该 Prompt 文件。安装或同步只装配 Prompt，调用后才会分析并编辑 `AGENTS.md`。

## 修改个人资产

新增 Prompt 只需一个 Markdown 文件，文件名使用小写字母、数字和连字符，frontmatter 提供单行 `description`；无需单独目录或 `asset.json`。工具入口位置由安装器统一映射。

```bash
mai asset import /path/to/my-shortcut.md --type prompts
mai asset edit my-shortcut --type prompts --file /path/to/prompt.md
mai sync --project /path/to/repo
# 更新此前显式安装的全局入口
mai setup --tools codex,claudecode,cursor
```

Web 的资产列表可编辑个人 Prompt 正文；内置 Prompt 只读，初始化与同步直接读取当前包。定制内置 Prompt 并复用到其他项目时，先另存为新文件名再导入。同步遇到项目定制按 merge / replace / abort 处理；默认保留本地内容并保存候选。不要把各工具入口替换为独立副本。已有清单式个人 Prompt 保持兼容，同名新文件不会覆盖它；同一目录中的新旧同名资产会报冲突，需保留一个源。
