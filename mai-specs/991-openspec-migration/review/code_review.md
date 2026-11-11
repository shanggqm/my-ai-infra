# Feature 991 代码评审

| 项 | 值 |
|---|---|
| 日期 | 2026-11-10 初评；同日复评 P1-1 至 P1-4 |
| 结论 | 有条件合并。四条 P1 已关闭，不再退回实现 |
| 比较基线 | HEAD `9c436d2ad920d9711f05776ea79b84b5cfd2c859`，评审对象是未提交工作区 |
| 需求来源 | `spec/PRD.md`（standard）。方案为 `design/TECH_DESIGN.md`、`design/CODE_DESIGN.md`。方案评审最新结论为有条件通过 |

个人记忆召回为空，未写入新记忆。`.my-ai-infra.json`、受管 `.gitignore` 片段、`.idea/` 和 `CLAUDE.md` 是本地工具状态，不纳入本结论。

## 范围与证据

工作区无 staged 变更。实现指纹：

| 文件 | git hash-object |
|---|---|
| `src/feature-migration.mjs` | `1c92ec78e7e4d2594c95d31f8ce10dffd69582df` |
| `src/feature-transaction.mjs` | `1af26bb1f8eccf1500debea0f0159fd0939e1339` |
| `src/feature-archive.mjs` | `4630b0bdbc7d930108fc08be3ea9b9d6edce5770` |
| `src/spec-delta.mjs` | `759655c3b08fc8cef1438d7e6f37dc9b74a71cc5` |
| `src/cli.mjs` | `0722df82f23270ef7f2bdc9d8885b0c113531749` |
| `src/project.mjs` | `7ba7015770af64db81cc332550b6efec80d4ef79` |
| `assets/skills/my-create-feature/scripts/feature-workspace.mjs` | `2225b5df30eda09c3bfac94917365b18c76f8329` |
| `test/feature-migration.test.mjs` | `5e9511505ab010a913bd516106146d2e1763b073` |

初评探针观察到当时的三处失败。复评在仓库根目录执行 `node --test --test-name-pattern 'later source edit|partially synced|archived by OpenSpec|removed imported|links outside' test/feature-migration.test.mjs`，5 项通过，退出码 0。这次没有重跑完整 `npm run verify`。

| 验收 | 实现与证据 | 判断 |
|---|---|---|
| AC-01、AC-02、AC-09 的主路径 | 预览不写盘，单导入保留任务字节和未选 change，批量冲突整批阻塞 | 已有测试覆盖主路径 |
| AC-04 | 重复导入复用编号。两侧先后修改时 `canApply false`，本地副本保留 | 复评关闭 P1-1 |
| AC-03、AC-10 的主路径 | 整仓按字节复制现行规格。标准日期归档目录中的已导入 change 可以切换；源目录消失且归档中也没有时继续阻塞 | 复评关闭 P1-3 |
| AC-05 | BRIEF 链接提案与任务，缺文件写入缺失说明，不生成占位 PRD | 静态符合。宿主接续未执行 |
| AC-06、AC-07 | 已等价 ADDED 与待新增 ADDED 并存时只新增后者。已核实 REMOVED 与待修改 MODIFIED 并存时只改后者。内容不一致的同名块仍冲突 | 复评关闭 P1-2。四种操作的一次归档提交仍只有解析器和单条 MODIFIED 归档测试 |
| AC-08 | 过期 revision、EEXIST、死锁不删除、已提交日志清理有测试 | 主路径有证据。最终复核到替换之间的窗口按已接受的 NFR-01 限制保留 |
| NFR-02 的外部相对引用 | 首次导入把树外链接写入 findings 和 `context/_INDEX.md`，不改原文字节 | 复评关闭 P1-4 |

## 关键发现

### P1-1 · 两侧先后修改会覆盖已保留的本地材料

状态：已关闭。`mappingFor`（247–254 行）在 `keep-target` 时保留上次 `targetDigest`。`decideImport`（327–330 行）在源和目标都偏离该基线时返回 `conflict`，`reuseChange`（206–208 行）不生成覆盖动作。

复核命令：`node --test --test-name-pattern 'later source edit' test/feature-migration.test.mjs`，退出码 0。本地 `# Local edit` 仍在，预览不可提交。

### P1-1 初评记录 · 两侧先后修改会覆盖已保留的本地材料

- 位置：`src/feature-migration.mjs` 的 `decideImport`（268–271 行）和 `currentMapping`（244–250 行），由 `reuseChange` 218 行在保留目标后仍回写映射。
- 触发：导入后只改 Feature 内副本并再次提交；OpenSpec 源随后也改变，再预览同一 `--change`。
- 机制：源未变时判定为 `keep-target`，同时把本地副本摘要写成新的 `targetDigest`。源再变时，目标等于这份新摘要，被当成可更新基线，生成覆盖动作。
- 影响：探针中本地 `# Local edit` 被提交成 `# Source edit`。这违反 BR-02 和 AC-04 的冲突保留。
- 归因：本次新增逻辑。阻断合并。
- 证据：临时目录实跑，`canApply true`，`decision update`，文件内容变为源文本。
- 修复：保留上次共同基线。源和目标都偏离该基线时返回 `conflict`，不生成覆盖动作，也不把单侧本地修改写成新基线。
- 复验：按上述两步修改再预览，预期 `canApply false` 且副本仍为本地文本。

### P1-2 · 部分已同步的差量无法归档

状态：已关闭。`evaluateDelta`（315–323 行）只把状态为 `apply` 的 ADDED、MODIFIED、REMOVED、RENAMED 交给 `applyDelta`。同名内容不一致仍在进入重放前冲突。

复核命令：`node --test --test-name-pattern 'partially synced' test/feature-migration.test.mjs`，退出码 0。已等价的 Audit 保留，Notice 被加入；已核实删除的 Timeout 不再被当成缺失，Retry 改为 5。内容不同的 Audit 仍然冲突。

### P1-2 初评记录 · 部分已同步的差量无法归档

- 位置：`src/spec-delta.mjs` 的 `evaluateDelta`（315–316 行）把整份差量交给 `applyDelta`。`applyDelta` 在 227–231 行把已消失的 REMOVED 判为冲突，在 242–244 行把已存在的 ADDED 判为冲突。
- 触发：同一能力差量中，一项已经与当前规格一致，另一项仍需应用。
- 机制：逐项判定能分出 `satisfied` 和 `apply`。只要不是全部满足，就会重放全部操作；重放不跳过已满足项。
- 影响：探针里已等价的 ADDED 得到「新增需求已存在」；已核实删除的 REMOVED 加上仍需修改的 MODIFIED 得到「找不到待删除需求」。当前规格保持不变，但 AC-06/AC-07 要求的部分同步归档无法提交。
- 归因：本次新增逻辑。阻断归档正确性，不阻断首次全量应用。
- 证据：直接调用 `evaluateDelta`，两次结果都是 `conflict`。
- 修复：应用阶段只重放状态为 `apply` 的操作；已满足项保持现状。内容不一致的同名块继续阻塞。
- 复验：一条已等价 ADDED 加一条缺失 ADDED，预览应只新增缺失需求。一条已核实 REMOVED 加一条匹配前态的 MODIFIED，预览应只改后者。

### P1-3 · OpenSpec 归档后的整仓切换被整批阻塞

状态：已关闭。`planCutover`（334–337 行）遇到活动目录或 `archivedChange`（354–360 行）能认出的归档目录时继续切换。归档目录名等于 change ID，或为 `YYYY-MM-DD-<id>`。源目录消失且归档中也没有对应目录时仍然阻塞。

复核命令：`node --test --test-name-pattern 'archived by OpenSpec|removed imported' test/feature-migration.test.mjs`，退出码 0。`2026-02-02-add-login` 切换后原 Feature 提案仍在，历史索引含该目录，现行规格字节与切换前的源规格一致。直接删除的 change 仍使 `--all` 不可提交。

### P1-3 初评记录 · OpenSpec 归档后的整仓切换被整批阻塞

- 位置：`src/feature-migration.mjs` 的 `planCutover`（275–277 行）。
- 触发：单变更导入成功后，按完成提示把该 change 移入 `openspec/changes/archive/`，再执行 `--all`。
- 机制：状态仍记录 `openspec/changes/<id>`。该目录不再是活动成员时，整份切换产生阻塞发现，动作被清空。
- 影响：探针结果为 `canApply false`，消息要求处置旧活动记录。没有命令可以完成这项处置。US-01 之后的 US-02 因此停住。变更完全消失时继续阻塞是合理的；已经进入 `openspec/changes/archive/` 的映射应复用原 Feature，并让历史副本走现有历史复制。
- 归因：本次新增逻辑。阻断已导入项目的整仓切换。
- 证据：临时目录完成导入、移入归档目录后预览 `--all`。
- 修复：映射源已出现在归档树时复用 Feature 并继续切换。源目录消失且归档中也没有对应 change 时维持阻塞。
- 复验：导入、归档、`--all` 后，原 Feature 编号仍在，现行规格按字节复制，历史索引含该归档目录。

### P1-4 · 指向变更目录之外的相对引用没有提示

状态：已关闭。首次导入在 `planChange`（170–176 行）扫描 Markdown 行内链接，树外目标写入 warning findings 和 `context/_INDEX.md`。提案原文保持原字节。

复核命令：`node --test --test-name-pattern 'links outside' test/feature-migration.test.mjs`，退出码 0。`../../specs/auth/spec.md` 显示现行规格和切换后的 `mai-specs/specs/` 位置；`../../missing.md` 记为失效。

### P1-4 初评记录 · 指向变更目录之外的相对引用没有提示

- 位置：`src/feature-migration.mjs` 的 `planChange`（170–190 行）和 `materialRows`（227–231 行）只复制文件并列出树内路径。
- 触发：提案或设计用相对路径指向 `openspec/specs/`、其他 change 或归档。
- 机制：保形复制后，树外相对路径的解析起点变成 `mai-specs/NNN-slug/context/openspec/`。实现不生成可定位提示，也不在无法定位时列出原文位置。
- 影响：NFR-02 和方案「在途材料」要求这些引用可访问，或明确列为待修复。当前导入可以成功，链接失效要到后续阅读才发现。
- 归因：本次新增逻辑。阻断接续材料完整性，不覆盖文件字节。
- 证据：静态阅读。未用含外链的样本实跑。
- 修复：扫描所选 Markdown 的相对链接。能映射到项目内源或目标的写入索引提示；不能定位的列出文件、原文片段和失效路径。关键需求或任务文件无法读取时维持阻塞。
- 复验：提案含 `../../specs/auth/spec.md` 时，预览或 BRIEF/索引能看到该引用的新位置或失效说明。

## 待验证事项

- 真实脱敏样本上的迁移、链接和任务接续仍未执行。`test/workflow-evals.md` 的宿主场景保持待验。
- AC-06 的四种操作同时归档提交仍未单测。P1-2 的两条混合差量已通过。
- 两个恢复进程同时提交的互斥尚未验证。见下方建议。
- 真实脱敏样本和宿主接续仍未执行。这不重新打开已关闭的四条 P1。

## 其他建议

- P2：`finish`（393 行）在 hint 已含「重新预览」时再追加一次。消失 change 的阻塞文案因此重复该动作。
- P2：`submitRecovery`（`src/feature-transaction.mjs` 278–291 行）确认原进程退出后直接回滚，没有单独的恢复互斥记录。
- P2：链接扫描只在首次创建 Feature 时执行，引用式 `[text][id]` 不在扫描范围内。后续只更新源文件时，索引里的链接说明不会重算。
- 初评要求的三条回归已落在 `test/feature-migration.test.mjs`：两侧分歧、混合差量、归档后切换，以及树外链接。

## 下一步

P1-1 至 P1-4 的复评结束，不再退回实现。真实样本和宿主接续仍待执行；完成前不把 Feature 991 视为验收通过。
