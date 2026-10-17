# 999 业务测试计划

[返回简报](../BRIEF.md) · [PRD](../spec/PRD.md) · [方案](../design/TECH_DESIGN.md)

## 范围与已有覆盖

复用 test/prompts.test.mjs、flat-layout.test.mjs、conflicts.test.mjs、assets.test.mjs、terminal.test.mjs 和 release-check。所有临时项目/个人库隔离，不执行实际 Hook/MCP；迁移检查基于重建的 0.0.8 受管状态。

## 待验业务用例

| 用例 | 验收 | 操作与预期 | 方式 |
|---|---|---|---|
| TC-01 | AC-01 | 全选工具 init，10 Skill + 3 Prompt；共享 SKILL.md 普通文件、Claude Skill 链接同一入口、旧命令不生成 | 自动 + 宿主 |
| TC-02 | AC-02 | 导入 Prompt，编辑项目正文，移动项目；入口引用始终解析到项目正文 | 自动 |
| TC-03 | AC-03 | 重建旧入口 sync，保留定制并清理受管旧链接；重复 sync 无漂移 | 自动 |
| TC-04 | AC-03/06 | 同名 Skill、未受管文件、阻塞父链接、失效预览；拒绝/跳过且保留现场 | 自动 |
| TC-05 | AC-04 | 中文空格 cwd 和显式 --project，包安装后 init/doctor/sync | 既有 CLI/发行检查 |
| TC-06 | AC-05 | 每工具清单包含 Skill、Prompt、Agent、规则、Hook/MCP/未知扩展，配置状态真实、hostVerified=false | 自动 |
| TC-07 | AC-07 | verify、release:check，真实 ChatGPT 引擎 skills/list 检查 13 项 | 自动 |
| TC-08 | AC-01/07 | Claude CLI、Cursor IDE、VS Code Copilot 实际入口发现和只读 Prompt 调用；记录版本与证据 | 宿主集成/人工 |

宿主调用用临时导入的只读 Probe Prompt，要求输出指定标识以证实正文加载，不调用三个会修改仓库的工作流。菜单检查不发模型请求；需要登录而当前无法完成时记受阻。清理仅本次临时目录。

## 执行结果

2026-10-15，最终源码在隔离副本执行 `MAI_CODEX_BIN=... MAI_CLAUDE_BIN=... npm run release:check`，包含 `npm run verify`：212 项通过、0 失败。隔离副本排除目标项目已安装的运行时链接，所有实际分发源与本次源码一致。发行包检查通过，未发布。详细结果及源码指纹见 [EVIDENCE.json](EVIDENCE.json)。

| 用例 | 结果 | 证据与剩余项 |
|---|---|---|
| TC-01 | 部分通过 | 自动装配通过；Codex/ChatGPT 引擎 13 项、Claude 初始化 13 项、Cursor 菜单 13 项。Copilot 待验 |
| TC-02 | 通过 | 定制、移动、特殊路径测试；Codex/Cursor Probe 均回复 MAI_DISCOVERY_PROBE_999 |
| TC-03/04 | 通过 | 0.0.8 迁移、幂等、备份、阻塞正文、同名入口、替换重试及既有回滚测试 |
| TC-05 | 通过 | CLI 中文/空格 cwd 与显式项目；实际包全局入口 init/doctor/sync |
| TC-06 | 通过 | 四工具清单与配置状态、终端、doctor 缺失入口诊断 |
| TC-07 | 通过 | 212 tests + 发行检查；Codex 13 项及重复 sync、Claude 13 项与两个角色 |
| TC-08 | 部分受阻 | Cursor 3.24.18 菜单无重复且只读调用通过；Claude 2.1.161 发现通过，调用返回未登录；VS Code 1.135.0 尚无可用 Copilot Chat 环境 |

整体验收：待补宿主证据，未通过全部验收条件。当前仓库已用源码 sync，并由 ChatGPT 引擎确认 13 个入口；项目选择的 codex/cursor 保持原状。
