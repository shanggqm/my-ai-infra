# 工作流 Skill

四个快捷工作流直接作为 Skill 分发、安装和管理，正文位于 `assets/skills/<名称>/SKILL.md`。

| Skill | 用途 |
|---|---|
| `my-auto-feature` | 从目标开始，编排需求、PRD、技术方案、评审修复、实现与验收 |
| `my-auto-design` | 从明确需求、PRD 或已有方案开始，推进方案评审、实现与验收 |
| `my-simple-feature` | 小功能、Demo 与模拟链路，按输入选择简版 PRD / 技术方案与分阶段交付 |
| `my-init-repo-memory` | 依据仓库事实生成或精简优化根目录 `AGENTS.md` |

前三个 Skill 负责阶段选择、输入交接、修复复评和状态，各阶段规则由对应 Skill 维护。默认初始化包含全部内置 Skill；手工缩减选择时，需补齐流程实际使用的阶段能力。仓库记忆初始化可独立使用，个人偏好由 `my-create-memory` 管理。

## 安装与调用

```bash
mai init --project /path/to/repo --tools codex,claudecode,cursor,copilot --yes
mai sync --project /path/to/repo
mai doctor --project /path/to/repo
mai asset list --type skills
```

项目正文直接位于 `.agents/skills/<名称>/SKILL.md`。Claude Code、Cursor、Copilot 分别通过 `.claude/skills/`、`.cursor/skills/`、`.github/skills/` 中的相对文件链接复用正文，移动整个项目后仍可使用。

| 工具 | 调用方式 |
|---|---|
| ChatGPT 桌面项目 | 输入 `@` 选择对应 Skill，具体选择符以当前客户端为准 |
| Codex CLI / IDE | `$my-auto-feature` 或 `/skills` 选择 |
| Claude Code / Cursor / VS Code Copilot | `/my-auto-feature` |

其他工作流使用对应名称，需求描述或方案路径放在同条消息中。安装后刷新或开启新会话，并确认当前工作目录为目标项目。也可明确要求读取并执行 `.agents/skills/my-auto-feature/SKILL.md`。

这四个 Skill 保留显式调用：`SKILL.md` 使用 `disable-model-invocation: true`，Codex 的 `agents/openai.yaml` 使用 `allow_implicit_invocation: false`。安装只装配文件，调用后才执行任务。

## 旧 Prompt 清理

新版本不再导入、编辑或分发 Prompt 资产。`init` / `sync` 清理项目的 `.agents/prompts/`、`.agents/assets/prompts/` 和所选工具的旧原生 Prompt 目录，移除所选工具对应的 Claude / Cursor command 入口以及个人 Prompt 的生成 Skill。识别到旧 Prompt 时补入四个工作流 Skill，以当前包正文覆盖旧转接入口；旧正文及其修改直接丢弃。此操作对 merge、replace、abort 策略一致，不做内容迁移。

其他个人 Skill、项目规则和无关 command 保留。清理列入 `plan` 预览、revision 校验及项目事务回滚；外部目录链接只移除链接自身。共享父目录为未知链接时不进入目标，并报告阻塞。普通 Skill 后续定制继续遵循现有冲突策略。

个人库旧 `assets/prompts/` 和 `prompts/` 在写入操作时清理，原固定选择补入四个工作流 Skill；`setup` 清理其安装作用域的旧入口。`init` 仅更新指定项目，不修改其他项目或用户主目录的全局入口。

## 维护快捷工作流

新建包含 `SKILL.md` 的目录，frontmatter 提供与目录一致的 `name` 和描述用途及触发条件的 `description`，然后按普通 Skill 导入：

```bash
mai asset import /path/to/my-team-workflow
mai asset edit my-team-workflow --file /path/to/SKILL.md
mai sync --project /path/to/repo
```

内置 Skill 只读；需要跨项目复用定制时，改用新名称导入个人库。工作台在“快捷工作流”分组显示这四个内置 Skill。资产与冲突规则见[统一资产管理](../assets/README.md)。

`doctor` 的 `ready` 只表示文件就绪，`hostVerified: false` 表示未验证宿主发现与调用。Hook / MCP 等扩展的文件装配与宿主注册分别验证；内置格式化 Hook 见[格式化说明](format-hooks.md)。

## 阶段、模板与 Feature 档位

完整流程默认用 my-auto-feature；需求充分从设计开始用 my-auto-design；轻量场景用 my-simple-feature。功能级 Demo 按输入生成独立设计或 PRD + 设计，微小明确改动可直接开发。显式完整流程/单阶段授权优先，必要验收证据缺失不结项。

档位唯一源为 [FEATURE_PROFILES.json](../assets/skills/my-create-feature/references/FEATURE_PROFILES.json)，默认 standard。新建脚本接受 `--profile`；BRIEF 是默认值真源，ROADMAP 为展示。目录保持 NNN-slug，两种档位共用编号池。新索引五列；旧四列保留，目标行说明前记规格前缀。单产物模板覆盖不改变 Feature 默认值；改默认值按[阶段契约](../assets/skills/my-create-feature/references/stage-contracts.md)定点同步、保护外部编辑，中断后按 BRIEF 恢复。

简版模板随 PRD/设计 Skill 安装；项目 `_templates/simple/` 可覆盖。已有文档增量维护，坏覆盖模板不会静默回退。simple 和 standard 共用产物路径，旧模板固定 PRD 字段可填写实际有效需求来源及 AC，不要求生成占位 PRD。
