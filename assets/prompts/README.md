# 自定义 Prompt

此目录是四个内置快捷指令的分发源。每个指令直接保存为 `<名称>.md`：文件名作为名称，frontmatter 的 `description` 提供简短描述。流程指令按场景编排原子 Skill，仓库记忆指令独立描述事实提炼与编辑规则。安装后由 `.agents/prompts/<名称>.md` 保存项目实体，安装器生成共享 Skill 入口供 ChatGPT/Codex、Cursor、VS Code Copilot 发现，并生成 Claude Code Skill 相对链接；生成入口引用同一正文。

| 名称 | 起点与流程 |
|---|---|
| [my-auto-feature](my-auto-feature.md) | 明确目标 → 自主整理需求与 PRD → 技术方案 → 方案 review 与修复 → 实现 → 代码 review 与修复 → 测试验收 |
| [my-simple-feature](my-simple-feature.md) | 小功能 / Demo → 按输入选择简版 PRD 或直接技术设计 → 实施 / 代码审查 / 验收，按风险补门槛，按复杂度分阶段 |
| [my-auto-design](my-auto-design.md) | 明确需求或 PRD → 编写技术方案（已有则复用）→ 方案 review 与修复 → 实现 → 代码 review 与修复 → 测试验收 |
| [my-init-repo-memory](my-init-repo-memory.md) | 无需参数，扫描当前仓库事实 → 生成或精简优化根目录 AGENTS.md → 核对并交付差异 |

三条开发指令遵守当前明确授权，Prompt 负责阶段选择、接续与状态，Skill 负责原子能力。simple 默认新 Feature 档位，已有 BRIEF Profile 及有效产物优先；阶段和模板独立选择，完整 SDD 与单阶段显式请求优先。`my-init-repo-memory` 可独立执行，保留有效项目约束与既有软链接，只在实际阻塞时询问；不配置 Skills、Hooks 或个人偏好记忆。

安装和调用见[自定义 Prompt 指南](../../docs/custom-prompts.md)。源码中的 `test/prompts.test.mjs` 提供自动化装配回归，`test/prompt-evals.md` 提供行为评测场景。
