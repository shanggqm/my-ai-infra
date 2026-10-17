# 素材索引 — 999

| 文件 | 类型 | 来源与原名 | 关键内容摘要 | 收集日期 | 派生自 |
|---|---|---|---|---|---|


## 关键发现

- 用户原始目标：确保 init 操作初始化后，所有资产在目前支持的四个 Agent 中，都可以完整地通过 / 找到。四个工具为 Codex（包括用户当前使用的 ChatGPT 桌面项目场景）、Claude Code、Cursor、GitHub Copilot。
- 问题背景：0.0.8 已修复 .agents 目录打平及 Skill 发现；此前真实 ChatGPT 引擎验收覆盖 10 个 Skill。三个 Prompt（my-auto-feature、my-auto-design、my-init-repo-memory）虽已安装到 .agents/prompts 并生成工具链接，用户仍无法在 ChatGPT 的 / 菜单找到。
- 本仓库 src/assets.mjs 的 parsePrompt 当前生成 .codex/prompts、.claude/commands、.cursor/commands、.github/prompts 入口；文件存在与链接有效尚不足以证明宿主菜单可发现和调用正确。
- 本次对话已查阅的 OpenAI 官方资料：https://learn.chatgpt.com/docs/custom-prompts 指出旧 custom prompts 已弃用，CLI/IDE 从用户级 Codex home 加载；https://learn.chatgpt.com/docs/build-skills 说明项目 .agents/skills 的发现规则。PRD 阶段应重新核实四工具、具体客户端及版本的原生入口能力。
- 需求应覆盖 init 后完整资产清单与四工具的映射、用户可见名称、菜单搜索及实际调用语义，重点确保三个现有 Prompt 可被发现。Skill 包装或其他原生适配作为候选方案，技术方案阶段再确定。
- 验收应覆盖当前工作目录 init、显式 --project、中文及空格路径、旧项目 sync 迁移、重复运行、项目移动及项目定制；保留既有冲突处理、只读预览、备份和回滚。
- 每个工具应记录客户端名称、版本、资产类型、期望入口、发现结果和调用证据；尚未验证的宿主明确记录未验证，文件装配测试及单一工具成功不能替代四工具验收。
- 本次仅建立 draft 需求与上下文，后续编写 PRD 和技术方案，再开展实现及发布。

## 开放问题

- 四工具的具体支持客户端与最低版本如何界定？特别是 ChatGPT 桌面、Codex CLI/IDE、Copilot IDE/CLI 是否分别纳入验收？
- 逐工具核实 / 的原生支持：如果某资产仅支持 @、$、角色选择或自动触发，如何通过适配满足用户的 / 发现目标？无法满足的组合需明确为待解决限制，并在 PRD 评审时确认，不能默认降级后宣称完成。
- “所有资产”包括 Skill、Prompt、Agent、Hook、MCP 等类型时，哪些作为用户主动调用入口，哪些通过入口展示或编排依赖？Hook/MCP 等资产应如何在可发现性目标下保持原生触发与权限语义？
- 三个 Prompt 是否转换为 Skill，或生成专用入口适配？如何保持正文唯一来源、项目作用域、名称稳定、无重复菜单项和迁移兼容？
- 如何验证自定义导入资产及新增资产同样获得入口，并明确安装后刷新或重启要求、缺失诊断和修复路径？
