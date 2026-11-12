# Feature 991 实施记录

> 状态：实现、自动化验证、安装包验收与 Cursor、Claude Code 宿主续接已完成。Codex 宿主与真实项目样本未验证，Feature 保持 review。

## 产物

- 迁移自带工作区：`src/migrations/workspace.mjs`。编号、ROADMAP、模板渲染和 `mai-specs/.feature-init.lock` 与初始化器规则一致，`init-feature.mjs` 不改动，`test/migration-workspace-parity.test.mjs` 约束一致性。
- 迁移：`src/migrations/openspec.mjs`、`openspec-selection.mjs`、`openspec-scan.mjs`、`openspec-metadata.mjs`、`openspec-preview.mjs`，以及 `src/feature-migration.mjs`。
- 事务与差量：`src/feature-transaction.mjs`、`src/spec-delta.mjs`。
- 入口：`src/cli.mjs` 增加 `migrate openspec` 和 `migrate recover`，不改动 `src/project.mjs`。本次不提供 `mai feature archive`。
- 接续说明：阶段 Skill 和 `stage-contracts.md` 保持原流程。BRIEF 登记有效需求来源、技术方案和当前任务。用法与文件映射写在 `docs/usage.md`。

## 已核对的行为

- 预览只读。`--change`、`--changes`、`--active`、`--all` 互斥；空活动范围退出 0。提交必须携带当前 revision，过期 revision 退出 2。`--changes` 接受空格分隔的多个 ID，也接受原来的逗号形式。预览 JSON 把 `revision` 和提交命令放在末尾，终端摘要的最后一行给出可复制命令。
- 在途材料按 MAI 布局对齐：提案和差量要求进入 `spec/PRD.md`，设计和任务进入 `design/TECH_DESIGN.md`。`context/` 只收无法归入这些产物的附件。`.openspec.yaml` 不写入 Feature。OpenSpec 的 Why、What Changes、Capabilities、Impact 和设计的 Context、Goals、Decisions、Risks、Migration Plan 分别进入 PRD 与技术方案的对应章节。提案能力与差量不一致时给出警告。源任务变化后更新 BRIEF 的当前任务。
- 单变更、批量和整仓切换按一次事务写入。批量任一项阻塞则不写。索引阶段注入失败后，已复制内容回滚。
- 整仓切换把活动 change 和已归档 change 对齐为 Feature。已归档 change 的 Phase 为 done。不创建 `mai-specs/specs/` 或 `mai-specs/history/`，不重放差量。切换后增量导入被阻塞。
- 相同相对路径在不同来源下不复用已有 Feature。slug 已被占用时阻塞。
- 提交标记已写、日志未清理时，恢复只删除日志并保留结果。链接前出现的外部文件保留。没有事务的已退出锁不被迁移删除。
- `retire_capabilities: true` 时迁移保留能力文件，并在预览中警告。

## 验证

| 命令或场景 | 结果 |
|---|---|
| `npm run verify` | 通过。变基到 0.0.15 主线后 320 项测试，0 失败，16 个 Skill；其中迁移 29 个用例、工作区一致性 10 个用例 |
| `npm run release:check` | 通过。需求负责人在 0.0.14 基线的最终代码上执行过一次；分支随后变基到 0.0.15 主线（`fd83050`），在变基后的代码上再执行，退出码 0。安装包 `dist/easyuseai-my-ai-infra-0.0.15.tgz`，报告 `dist/release-report.json` |
| `npm run test:web` | 本轮未运行。早先通过；`src/project.mjs` 已还原为 0.0.14，Web 写入路径未改 |
| Cursor 宿主续接 | 通过。从迁入 Feature 的 2.1 接续，对照代码确认 1.1、1.2，完成实现并更新任务。该次同时改了 OpenSpec 源，触发整仓切换阻塞，已用只读说明与可操作提示处理 |
| Claude Code 宿主续接 | 通过。重建隔离项目并整仓切换后，从 997 的 2.1 接续，勾选只写 MAI 一侧，未改 `openspec/`，`npm test` 6 项通过；之后再预览整仓切换，复用 4 个 Feature，无阻塞、无写入 |

## 代码评审修复

对照 `review/code_review.md` 的 P1-1 至 P1-4：

- 源未变化时保留上次共同基线。源和目标之后都偏离该基线时，预览阻塞且不覆盖本地副本。
- 归档差量只重放仍需应用的操作。已等价的新增、已核实的删除留在原地；同名内容不一致仍阻塞。
- 已导入 change 出现在 `openspec/changes/archive/` 时，整仓切换复用原 Feature。活动目录和归档里都没有该 change 时继续阻塞。
- 变更 Markdown 中指向该变更目录之外的相对引用写入预览 findings 和 `context/_INDEX.md`。原文字节不改。

首轮修复后 `npm run verify` 为 299 通过。

## 复审修复（2026-11-12）

详见 `review/code_review.md` 的复审一节：产物路径读取项目布局；Phase 一律标为 done 并保留用户写的当前任务；当前任务标注为迁移时快照；导入后新增的源文件不再误报冲突；来源标注为只读，阻塞提示列出被改文件；重复预览的复用数和提示更正；删除无调用方代码。

## 偏差与未验证

- revision 含解析后的项目根、`openspec/changes` 的直接成员、发现项和动作前后摘要。嵌套空目录、布局 `initialFiles` 没有单独字段；已选文件的内容变化仍会改变动作摘要。
- 不使用工作区锁的编辑器，在最后一次复核和替换已有文件之间的窗口不检测、不承诺保留外部写入。
- 同一 slug 被占用时直接阻塞，不为该来源另分配编号。
- 隔离项目已在 Cursor 和 Claude Code 中按现有实施流程从迁入 Feature 的当前任务接上。Codex 宿主未验证（没有可用环境），真实项目样本未迁移（负责人暂不安排）。
- 装配（`mai sync`）不参与工作区锁，迁移期间应避免同时运行；迁移写入前逐文件核对状态，发现改动会拒绝提交。
- 迁移后的 BRIEF 当前任务只是迁移时快照，不随勾选自动更新。
- 没有迁移操作界面。Web 回归只证明现有装配 apply 仍可完成。
