# 四工具资产发现技术方案

[返回需求简报](../BRIEF.md) · [PRD](../spec/PRD.md)

> 基线 HEAD：f4861bf017bf6dc793c658cfc7c34c16d90ac4e4；包含已有未提交 0.0.8 修改，工作区快照已隔离保存。状态：已复评并实施。

## 1. 方案概述

复用 plan/apply/setup、受管状态与冲突引擎。Prompt 保留单份正文，ChatGPT/Codex、Cursor、Copilot 使用 `.agents/skills/<名称>/SKILL.md` 的普通文件入口；Claude 使用 `.claude/skills/<名称>/SKILL.md` 相对链接。Skill 入口包含 name/description、显式调用语义与相对正文引用，解析路径时以入口实际所在位置为准。不给 Prompt 再增加 Cursor commands 或 Copilot prompt file，避免同名菜单重复。

## 2. 详细设计

- assets.mjs 新增 promptTargets 和 renderPromptSkill。所有 Prompt（含旧清单式）依据其支持工具集合装配统一入口；旧清单的工具键继续限定适用工具，Prompt 路径交给适配器。其他扩展原目标保持。
- 入口只生成指令与正文相对引用，不复制流程。仅显式调用：标准 frontmatter disable-model-invocation 与 Codex agents/openai.yaml 的 allow_implicit_invocation=false。同名选中 Skill 冲突在写入前报告；普通本地文件走原冲突策略。
- addExtensions 返回安装目录映射。现有 Skill 仍按现有方式安装；Prompt 的共享入口是普通文件，避免 SKILL.md 文件软链发现问题。Claude 的 Skill 入口链接共享 SKILL.md，供 Cursor 按同名 Skill 去重。
- 新 discovery.mjs 生成选中工具 × 资产清单（Skill、Prompt、Agent、规则、扩展）。字段为 tool/type/name/path/invocation/status/hostVerified；status 区分 ready、needs-sync、configuration-required、unsupported。ready 仅指文件就绪；hostVerified=false 不推断客户端成功。
- plan/publicPlan、init/sync、doctor 共用清单。终端 result 增加入口分组；JSON 保留既有字段并添加 discovery。
- 项目旧入口由已有状态差集移除，正文按原冲突策略保留。global setup 对当前工具的受管旧 Prompt 别名做匹配校验、备份、删除；未受管路径保持原状。先校验全部再执行，沿用回滚。
- 链接路径固定于作用域内，移动目录后有效。被阻塞正文必须连带跳过入口及旧入口移除，防止留下可选择但无法加载的 Skill。

## 3. 风险与防护

| 风险 | 防护与验证 |
|---|---|
| 同名 Skill/Prompt | addFile 冲突检测，报名称与路径；前置计划失败不写入 |
| 本地 wrapper 被修改 | merge 保留并报告差异；doctor 不等同宿主通过；正文是唯一业务编辑入口 |
| 旧入口有用户定制 | 记录候选、原文件和恢复路径；全局不同内容拒绝覆盖 |
| 正文被不安全父链接阻塞 | 入口显式依赖正文，跳过入口并保留旧入口，报告 needs-sync |
| 依赖 Skill 未选中 | 保留原 Prompt 行为及文档说明；调用中发现必要 Skill 缺失应说明，不静默承诺工作流完成 |
| Hook/MCP 缺注册协议 | configuration-required，保留权限与配置，不宣称自动激活 |

## 4. 兼容与证据

旧 Codex 用户级 prompts 不再作为新安装依赖。自定义 CODEX_HOME 仍可发现项目 .agents。Cursor 与 VS Code 以当前官方共享目录支持为依据，实际本机版本需验证。旧清单式 Prompt 的目标路径改为统一原生入口，工具支持键保留，正文和资源不变。迁移在用户 init/sync/setup 时执行，不改宿主全局配置。

## 5. 任务

| 任务 | 文件 | 验收 |
|---|---|---|
| T1 Prompt 原生适配及迁移 | src/assets.mjs、project.mjs、store.mjs、conflicts.mjs | AC-01/02/03/06 |
| T2 调用清单与终端 | src/discovery.mjs、project.mjs、terminal.mjs | AC-05 |
| T3 回归与真实引擎验收 | test/prompts.test.mjs、新发现测试、scripts/release-check.mjs | AC-01 至 07 |
| T4 使用说明与验收记录 | docs/custom-prompts.md、docs/usage.md、assets/prompts/README.md、本 Feature | AC-05/07 |

无数据库、网络 API 或额外运行时依赖。发布新版本须另行决定，本次不发布。

## 实测修订

Cursor IDE 的 / 菜单同时读取 Claude commands 与共享 Skill，初版实测发生重复。2026-10-15 改为四工具统一 Skill 格式；Claude 的 SKILL.md 链接共享普通文件，清理受管 Claude commands。正文仍保持唯一来源。此修订保留原验收口径。

代码复评修订：生成入口有本地冲突时标记 skip，保留旧入口并保存新候选；特殊正文文件名逐段 URL 编码。参见代码评审与回归证据。
