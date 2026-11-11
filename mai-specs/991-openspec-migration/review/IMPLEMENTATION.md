# Feature 991 实施记录

> 状态：实现与本阶段自检已完成。BRIEF 仍为 draft，本记录不推进 Phase 或 ROADMAP，也不代表宿主验收通过。

## 产物

- 共享工作区：`assets/skills/my-create-feature/scripts/feature-workspace.mjs`。编号、ROADMAP、模板渲染和 `mai-specs/.feature-init.lock` 由初始化与迁移共用。
- 迁移：`src/migrations/openspec.mjs`、`openspec-selection.mjs`、`openspec-scan.mjs`、`openspec-metadata.mjs`、`openspec-preview.mjs`，以及 `src/feature-migration.mjs`。
- 事务与差量：`src/feature-transaction.mjs`、`src/spec-delta.mjs`。
- 入口：`src/cli.mjs` 增加 `migrate openspec` 和 `migrate recover`。`src/project.mjs` 在装配写入 `mai-specs/` 时使用同一工作区锁，doctor 报告未完成事务。本次不提供 `mai feature archive`。
- 接续说明：阶段契约新增「迁移接续」；PRD、设计、实施、测试、方案评审和代码评审各加一条 BRIEF 链接规则。使用指南、故障排查、规格工作区说明、`manifest.yml` 和 `test/workflow-evals.md` 已同步。

## 已核对的行为

- 预览只读。`--change`、`--changes`、`--active`、`--all` 互斥；空活动范围退出 0。提交必须携带当前 revision，过期 revision 退出 2。`--changes` 接受空格分隔的多个 ID，也接受原来的逗号形式。预览 JSON 把 `revision` 和提交命令放在末尾，终端摘要的最后一行给出可复制命令。
- 在途材料按 MAI 布局对齐：提案和差量要求进入 `spec/PRD.md`，设计和任务进入 `design/TECH_DESIGN.md`。`context/` 只收无法归入这些产物的附件。`.openspec.yaml` 不写入 Feature。OpenSpec 的 Why、What Changes、Capabilities、Impact 和设计的 Context、Goals、Decisions、Risks、Migration Plan 分别进入 PRD 与技术方案的对应章节。提案能力与差量不一致时给出警告。源任务变化后更新 BRIEF 的当前任务。
- 单变更、批量和整仓切换按一次事务写入。批量任一项阻塞则不写。索引阶段注入失败后，已复制内容回滚。
- 整仓切换按字节复制现行规格和历史，不重放活动或历史差量。切换后增量导入被阻塞。
- 相同相对路径在不同来源下不复用已有 Feature。slug 已被占用时阻塞。
- 归档要求 MAI 维护权、任务全勾、独立验收清单、证据摘要和差量前态。当前规格已漂移时不覆盖。重复归档不重放差量。
- 提交标记已写、日志未清理时，恢复只删除日志并保留结果。链接前出现的外部文件保留。没有事务的已退出锁不被迁移删除。
- `retire_capabilities: true` 时迁移保留能力文件，并在预览中警告。

## 验证

| 命令 | 结果 |
|---|---|
| `node --test test/feature-migration.test.mjs` | 13 通过 |
| `npm run release:check` | 通过。其中 `npm test` 为 294 通过、0 失败。安装包 `dist/easyuseai-my-ai-infra-0.0.14.tgz`，报告 `dist/release-report.json` |
| `npm run test:web` | 通过。覆盖真实 apply、冲突保留和 1440/390 布局。首次需安装 Playwright Chromium |

## 代码评审修复

对照 `review/code_review.md` 的 P1-1 至 P1-4：

- 源未变化时保留上次共同基线。源和目标之后都偏离该基线时，预览阻塞且不覆盖本地副本。
- 归档差量只重放仍需应用的操作。已等价的新增、已核实的删除留在原地；同名内容不一致仍阻塞。
- 已导入 change 出现在 `openspec/changes/archive/` 时，整仓切换复用原 Feature。活动目录和归档里都没有该 change 时继续阻塞。
- 变更 Markdown 中指向该变更目录之外的相对引用写入预览 findings 和 `context/_INDEX.md`。原文字节不改。

`node --test test/feature-migration.test.mjs`：18 通过，覆盖以上四条。`npm run verify`：299 通过、0 失败。

## 偏差与未验证

- revision 含解析后的项目根、`openspec/changes` 的直接成员、发现项和动作前后摘要。嵌套空目录、布局 `initialFiles` 没有单独字段；已选文件的内容变化仍会改变动作摘要。
- 不使用工作区锁的编辑器，在最后一次复核和替换已有文件之间的窗口不检测、不承诺保留外部写入。
- 同一 slug 被占用时直接阻塞，不为该来源另分配编号。
- 尚未用真实脱敏样本执行迁移，也尚未在宿主里接续一个导入后的 Feature。`test/workflow-evals.md` 的「OpenSpec 迁移接续」保持待验。
- 没有迁移操作界面。Web 回归只证明现有装配 apply 仍可完成。
