# 自定义 Prompt

此目录是三个内置快捷指令的分发源。每个指令直接保存为 `<名称>.md`：文件名作为名称，frontmatter 的 `description` 提供简短描述。流程指令用一句话编排已有 Skill，仓库记忆指令独立描述事实提炼与编辑规则。安装后由 `.agents/prompts/<名称>.md` 保存项目实体，安装器生成共享 Skill 入口供 ChatGPT/Codex、Cursor、VS Code Copilot 发现，并生成 Claude Code Skill 相对链接；生成入口引用同一正文。

| 名称 | 起点与流程 |
|---|---|
| [my-auto-feature](my-auto-feature.md) | 明确目标 → 自主整理需求与 PRD → 技术方案 → 方案 review 与修复 → 实现 → 代码 review 与修复 → 测试验收 |
| [my-auto-design](my-auto-design.md) | 明确需求或 PRD → 编写技术方案（已有则复用）→ 方案 review 与修复 → 实现 → 代码 review 与修复 → 测试验收 |
| [my-init-repo-memory](my-init-repo-memory.md) | 无需参数，扫描当前仓库事实 → 生成或精简优化根目录 AGENTS.md → 核对并交付差异 |

前两条指令适用于目标、范围已足够明确的任务，调用即表达连续阶段授权，执行细则由各 Skill 维护。`my-init-repo-memory` 可独立执行，保留有效项目约束与既有软链接，只在实际阻塞时询问；不配置 Skills、Hooks 或个人偏好记忆。

安装和调用见[自定义 Prompt 指南](../../docs/custom-prompts.md)。源码中的 `test/prompts.test.mjs` 提供自动化装配回归，`test/prompt-evals.md` 提供行为评测场景。
