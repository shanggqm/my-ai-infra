# 991: 接入 MiniMax Code 工具

| 项 | 值 |
|---|---|
| Phase | review |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | zhaiwenjia |
| 目标日期 | 待填 |
| 涉及子系统 | project、CLI、Web、assets、discovery、文档 |

## 一句话描述

把 MiniMax Code 作为第五种 Coding 工具接入 Skill、运行规则、格式化 Hook 与用户级角色入口

## 背景

框架已支持 Codex、Claude Code、Cursor 与 GitHub Copilot，README 的支持列表与 `manifest.yml` 的 `configuration.tools` 都按工具枚举，CLI、Web、规则入口、扩展资产与用户级安装各有一份工具映射。MiniMax Code 需要按其原生目录约定接入同一套机制，并如实说明它与其它工具的差异。

## 关键决策

- 目录约定以 MiniMax Code 客户端随附实现为准：项目 Skill 为 `.minimax/skills/`，项目 Hook 为 `.minimax/hooks.json`，用户级 Skill 为 `~/.minimax/skills/`，自定义 Agent 为 `~/.minimax/agents/<名称>/agent.md`；项目运行规则沿用仓库根目录 `AGENTS.md`，与 Codex、Cursor 共用同一入口与唯一内容源。
- MiniMax Code 拒绝软链接的 `SKILL.md`，但接受软链接的技能目录。因此 Skill 入口是整个 Skill 目录的相对软链接：项目内 `.minimax/skills/<名称>` → `../../.agents/skills/<名称>`，全局 `~/.minimax/skills/<名称>` → `../../.agents/skills/<名称>`；正文仍是 `.agents/skills/<名称>/SKILL.md` 的普通文件，用户修改后各入口立即同步，不产生副本漂移。
- MiniMax Code 只在用户数据目录注册自定义 Agent，没有项目级 Agent 目录。项目装配因此不生成 `.minimax/agents/`，`discovery` 把该工具的角色标为「未适配」并说明改用 `mai setup`；用户级安装生成普通文件 `<名称>/agent.md`（宿主忽略软链接的 `agent.md`），格式包含 `name`、`description` 与 `skills`。
- 格式化 Hook 注册写入 `.minimax/hooks.json`，事件 `Stop`，结构沿用分组命令 Hook。MiniMax Code 的命令 Hook 超时上限为 10 秒，注册按上限设置，与其它宿主的 30 秒不同，长耗时格式化脚本可能被提前中断，已在文档说明。
- `my-format` 扩展资产补充 `mcode` 目标 `.minimax/hooks/my-format.mjs`，使格式脚本与注册一并装配；取消该工具时 `.minimax/` 整体备份移除，与 Codex、Claude Code、Cursor 的专属目录策略一致。
- 工具标识用 `mcode`，CLI 另接受 `minimax` 与 `minimax-code`。新增别名不影响已有配置，未选择该工具的项目行为不变。
- 改动覆盖 CLI、CLI 选择菜单、Web 工作台标签、`manifest.yml` 工具清单与使用指南、自定义 Agent 与格式化 Hook 文档，以及入口 Skill 的可选工具说明。

## 验证

`test/discovery.test.mjs` 覆盖第五种工具的 Skill、规则与「未适配」角色状态；`test/agents.test.mjs` 覆盖项目级不生成角色入口、用户级生成普通 `agent.md` 与 `skills` 声明；`test/format-hook.test.mjs` 覆盖第五个宿主的注册合并、用户设置保留与重复同步幂等；`test/infra.test.mjs` 覆盖 MiniMax Code 入口是目录软链且 `SKILL.md` 仍是普通文件；`test/asset-removal.test.mjs`、`test/removed-skill.test.mjs`、`test/single-source.test.mjs`、`test/workflow-skills.test.mjs`、`test/debt-assets.test.mjs`、`test/feature-init.test.mjs` 随工具数量调整断言；`scripts/release-check.mjs` 在实际安装包中核对 `.minimax/skills/` 目录入口、无项目级角色目录、`.minimax/hooks.json` 注册与 10 秒超时。

2026-11-11 验证通过：`npm run verify`（278 项测试通过）与 `npm run release:check` 全绿。宿主内的真实发现、项目 Hook 开关与模型行为继续单独验收。

## 上下文索引

- [素材索引](context/_INDEX.md)
