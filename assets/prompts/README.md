# 常用流程 Prompt

此目录是两个内置快捷指令的分发源。每个指令直接保存为 `<名称>.md`：文件名作为名称，frontmatter 的 `description` 提供简短描述，正文只用一句话编排已有 Skill。安装后由 `.agents/assets/prompts/<名称>.md` 保存项目实体，安装器统一生成各工具的相对文件软链接。

| 名称 | 起点与流程 |
|---|---|
| [my-auto-feature](my-auto-feature.md) | 明确目标 → 自主整理需求与 PRD → 技术方案 → 方案 review 与修复 → 实现 → 代码 review 与修复 → 测试验收 |
| [my-auto-design](my-auto-design.md) | 明确需求或 PRD → 编写技术方案（已有则复用）→ 方案 review 与修复 → 实现 → 代码 review 与修复 → 测试验收 |

两条指令均适用于目标、范围已足够明确的任务，调用即表达连续阶段授权。执行细则由各 Skill 维护。

安装和调用见[自定义 Prompt 指南](../../docs/custom-prompts.md)。源码中的 `test/prompts.test.mjs` 提供自动化装配回归，`test/prompt-evals.md` 提供行为评测场景。
