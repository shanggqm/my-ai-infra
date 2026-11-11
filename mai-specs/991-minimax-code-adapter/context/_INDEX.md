# 素材索引 — 991

| 文件 | 类型 | 来源与原名 | 关键内容摘要 | 收集日期 | 派生自 |
|---|---|---|---|---|---|
| `/Applications/MiniMax Code.app/Contents/Resources/app.asar` | 客户端产物 | MiniMax Code 桌面版安装包 | 内含 `@mavis/skills` 技能注册表与自定义 Agent 解析器；MiniMax Code 目录约定与软链限制的原始依据 | 2026-11-11 | 客户端安装包 |

## 关键发现

- 技能根注册：`readConfiguredSkillRoots` 把 `<项目>/.minimax/skills` 注册为外部根 `workspace-minimax`（`kind: 'workspace'`，优先级 65，默认开启），`<用户目录>/.minimax/skills` 注册为原生根 `user-global`（`kind: 'global'`）。默认同时开启 `workspace-agents`（`.agents/skills`）与 `user-agents`（`~/.agents/skills`）。
- 外部根带 `allowDirectorySymlinksOutsideRoot: true`；`kind` 为 `agent`、`global`、`user`、`builtin` 的根同样允许目录软链越界解析。
- `listSkillFiles` 先 `readdir` 技能根，遇到符号链接的技能目录会 `realpath` 解析为内容目录；但内容目录里的 `SKILL.md` 若是符号链接则报 `skill_symlink_rejected` 并跳过。因此「链接整个技能目录」可用，「链接 `SKILL.md`」不可用。
- 自定义 Agent 只在 `<dataDir>/agents/<名称>/agent.md` 注册，没有项目级目录；`inspectCanonicalCustomAgent` 对符号链接的 `agent.md` 直接跳过，故用户级入口必须是普通文件。
- `agent.md` 前置字段白名单含 `name`、`description`、`model`、`effort`、`tools`、`disallowedTools`、`mcpServers`、`skills`、`x-mavis`；`skills` 是预载的技能名称数组，不是路径。
- Hook 文档结构为 `{ hooks: { <事件>: [{ matcher?, hooks: [{ type: 'command', name?, command, timeout? }] }] } }`，事件含 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop` 等；命令 Hook 的 `timeout` 取值范围 1–10 秒，默认 5 秒，同事件全部 Hook 合计 15 秒。
- 项目 Hook 需在客户端设置页 Hooks 中选中项目并开启；用户级 `~/.minimax/hooks.json` 顶层需 `enabled: true`。

## 开放问题

- 客户端未提供项目级自定义 Agent 注册入口，若后续支持需重新评估项目装配口径。
- 项目级技能依赖外部技能根 `workspace-minimax`，用户关闭该来源后项目内技能不可见，全局 setup 不受影响。
