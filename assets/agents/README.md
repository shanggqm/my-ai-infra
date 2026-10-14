# 自定义 Agent 资产

此目录保存工具无关的角色定义，评审方法在关联 Skill 中维护。

| 角色资产 | 职责 | 关联 Skill |
|---|---|---|
| [architecture-review.md](architecture-review.md) | 技术方案的架构评审 | [my-review-design](../skills/my-review-design/SKILL.md) |
| [code-review.md](code-review.md) | 需求实现、PR 与代码变更评审 | [my-review-code](../skills/my-review-code/SKILL.md) |

- `name`、`description` 使用 JSON 双引号字符串，`skills` 使用 JSON 字符串数组；文件名与 `name` 一致。
- 正文定义角色、目标和职责边界，使用 `{{SKILL:名称}}` 引用声明的 Skill。
- 安装器从同一角色源生成各工具原生文件，并将 Skill 引用转为可读取的相对路径。
- 个人资产位于 `~/.my-ai-infra/assets/agents/`。只有依赖 Skill 全部被选中时，角色才随项目初始化或同步安装。

目录与调用方式见 [自定义 Agent 使用指南](../../docs/custom-agents.md)。
