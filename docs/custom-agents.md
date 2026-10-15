# 自定义 Agent

当前版本包含 `architecture-review` 和 `code-review`；`code-review` 从 `0.0.3` 起加入。

角色定义关注职责和判断立场，Skill 保存方法、证据标准与报告要求。

| 自定义 Agent | 角色 | 关联 Skill |
|---|---|---|
| [architecture-review](../assets/agents/architecture-review.md) | 首席架构师，审查技术方案 | [my-review-design](../assets/skills/my-review-design/SKILL.md) |
| [code-review](../assets/agents/code-review.md) | 资深软件架构师，审查需求实现、PR 与代码变更 | [my-review-code](../assets/skills/my-review-code/SKILL.md) |

## 安装与使用

- `setup` 安装所选工具的全局入口、关联角色及所需 Skill。默认包括上述两个评审角色；通过 `--skills` 排除某个关联 Skill 时不新增对应角色。
- `init` / `sync` 随选中的 Skill 安装关联角色；`plan` / `--dry-run` 列出 Agent 和将写入的文件。Web 预览与应用使用同一安装流程。
- 项目取消关联 Skill 或切换工具时，移除未修改的受管角色文件。修改冲突会停止整个项目应用，`doctor` 可检查漂移。
- `setup` 沿用全局入口的增量安装行为，不自动删除此前为其他工具安装的入口。
- 安装或同步后开启新会话；已运行的客户端可能需要重启或刷新 Agent 列表。请求示例：“请使用 architecture-review 评审 mai-specs/999-record-search 的技术方案。”
- Claude Code 可在 `/agents` 查看；Copilot CLI 可在 `/agent` 选择。Codex、Cursor 可显式要求使用该名称的自定义 Agent。

代码评审请求示例：“请使用 code-review 评审 mai-specs/999-record-search 的实现”，或“请使用 code-review 评审当前 PR，核对需求和兼容性”。没有 Feature 工作区时直接交付评审结论，不为此创建规格目录。

以下以 `code-review` 为例；`architecture-review` 使用相同目录和扩展名，文件名替换为对应角色名。

| 工具 | 项目文件 | 用户级文件 |
|---|---|---|
| Codex | `.codex/agents/code-review.toml` | `~/.codex/agents/code-review.toml` |
| Claude Code | `.claude/agents/code-review.md` | `~/.claude/agents/code-review.md` |
| Cursor | `.cursor/agents/code-review.md` | `~/.cursor/agents/code-review.md` |
| Copilot | `.github/agents/code-review.agent.md` | `~/.copilot/agents/code-review.agent.md`（Copilot CLI） |

Copilot 的项目文件同时适用于支持自定义 Agent 的 IDE；用户级 IDE 入口由各 IDE 管理，不能将 CLI 目录视为所有 IDE 的全局目录。Copilot CLI 同名个人角色优先于项目角色；需要项目版本时检查 `/agent` 的来源。

Codex 生成必需的 `name`、`description`、`developer_instructions`。Claude Code 额外通过 `skills` 预载关联 Skill。所有格式均包含指向实际 Skill 文件的引用；Copilot CLI 同时启用项目指令继承。模型、推理强度和权限沿用客户端配置。

## 维护资产

```bash
my-ai-infra agents
my-ai-infra plan --project /path/to/project
my-ai-infra sync --project /path/to/project
```

随包角色源位于 `assets/agents/`，个人角色源位于 `~/.my-ai-infra/assets/agents/`。修改个人源后执行 `sync` 更新项目；更新全局入口使用 `setup`。`upgrade` 更新未修改的内置角色并备份，保留个人修改。

项目的中立源保存在 `.agents/agents/`，原生格式集中生成到 `.agents/.generated/<工具>/agents/`，工具目录全部为软链接入口。修改个人源后同步可更新项目；项目中立源的修改在默认 merge 下保留，并重新生成各工具格式。角色文件支持的字段和引用语法见 [资产说明](../assets/agents/README.md)。

安装不代替宿主的能力开关、受信任工作区或组织策略。Codex 的 `agents.enabled` 若被显式禁用，需要由用户启用；安装器不覆盖该配置。自动测试核对原生文件、依赖路径、同步、冲突与分发；实际对话判断质量需在所用客户端中观察。

## 格式依据

2026-10-14 核对的官方文档：

- [Codex 自定义 Agent](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Claude Code Subagents 与 Skill 预载](https://code.claude.com/docs/en/sub-agents)
- [Cursor Subagents](https://cursor.com/docs/subagents)
- [Copilot Agent 配置](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [Copilot CLI 目录与加载](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [VS Code 自定义 Agent](https://code.visualstudio.com/docs/agent-customization/custom-agents)
