# Feature 991：供评审的代码设计

[返回技术方案](TECH_DESIGN.md) · [验收来源](../spec/PRD.md#8-验收标准)

以下为 JavaScript 风格的设计示意，未执行。省略 CLI 参数解析、中文文案拼装、字节流和 Markdown 扫描的外围代码；关键输入、比较口径、状态变化及失败分支在下文定义。文件名均为拟议实现。

## 1. 工作区规划与导入

`src/migrations/workspace.mjs` 是迁移自带的工作区辅助，初始化脚本与项目装配保持原样。它提供 `readWorkspace`、`reserveFeature`、`renderFeature`、`moveRoadmapRow` 和 `acquireWorkspaceLock`；编号规则、ROADMAP 行和锁与 `init-feature.mjs` 一致，由 `test/migration-workspace-parity.test.mjs` 约束。编号分配从已有目录和 ROADMAP 收集占用，同一批次在内存逐项预留，不调用有写入副作用的 `initializeFeature`，也不在预览时预留实体目录。ROADMAP 只改目标行，复用四/五列表规则；归档跨分区重新渲染。

`src/feature-migration.mjs` 生成计划，并调用 `src/feature-transaction.mjs` 提交。迁移提交时取得与初始化器相同的工作区锁；`src/project.mjs` 的装配不参与该锁，迁移在写入前逐文件核对预览时的状态，装配改动过目标文件时拒绝提交并要求重新预览。读取端报告锁状态，预览不等待或修改现场。

```js
// 形状示意；路径一律为项目内 POSIX 相对路径。
Plan = {
  operation, sourceId, sourceVersion, selection, root, inputs, // 路径、文件类型/摘要、目录成员和缺失项
  actions,                         // { path, before, after, role }，含字节或受校验字节来源
  findings, canApply, revision
}
FileState = null /* 不存在 */ || { type: 'file', sha256, mode }
MigrationState = {
  version: 1,
  authority: { owner: 'mai' | 'external', sourceId: null | string },
  cutover: null || { sourceId, sourceDigest, planRevision },
  imports: { [sourceId]: { [sourcePath]: { featurePath, files: { [sourceRel]: {
    targetRel, sourceDigest, targetDigest
  }}}}},
  archives: { [featurePath]: { planRevision, historyKey } }
}
```

扫描只把标准目录中的 Markdown 当作结构化输入：现行及差量规格按递归能力路径定位；活动变更是 `changes/` 的直接子目录，排除 `archive/`；仅含嵌套变更而无可识别顶层产物时报告不支持。所选范围内遍历普通文件和目录，拒绝软链接及特殊文件。文件摘要用 SHA-256 计算原始字节；目录输入记录实际成员、类型和缺失状态。发现未知语义配置时，不求值或加载 schema：单导入可保留原始材料并标为待核对，整仓接管或归档遇到影响规格的未知语义时阻塞。默认识别所需的标准元数据；无法可靠识别时优先报告，不把未知选项默认为关闭。现行能力目录中的附属文件同路径保形复制；变更或归档中的附件一并保留。根级旧工具配置保留在源，仅按需登记参考链接。

```js
function decideImport(state, sourceId, sourcePath, sourceTree, targetTree) {
  const previous = state.imports[sourceId]?.[sourcePath]
  if (!previous) {
    return canCreateTarget(sourceTree, targetTree) ? 'create' : 'conflict'
  }
  assertUniqueIdentity(previous.featurePath, currentRoadmap, currentBrief)
  if (sourceTree.matchesFileDigests(previous.files)) return 'keep-target'
  if (hasDeletedSourceFile(previous.files, sourceTree)) return 'conflict'
  if (mappedTargetEqualsSource(sourceTree, targetTree)) return 'adopt-equal'
  if (mappedTargetEqualsBaseline(previous, targetTree)
      && allNewDestinationPathsAreFree(sourceTree, targetTree)) return 'update'
  return 'conflict'
}
```

比较仅限受管原始材料，BRIEF 中的人工批注和无关文件不参与源/目标的三方冲突判定，也不被覆盖。源本来缺件时照实登记；之前导入的关键材料在目标缺失或改址时，检查 BRIEF 是否有可读的唯一替代入口，否则阻塞接管该变更。既有源消失、改名或转入 OpenSpec archive 时，列出映射、旧副本和历史候选，保留全部数据。首版手工对账通过备份、核对原历史与本地差异、修复目标及对应登记后重预览；不提供覆盖或删除原始资料的强制参数。

身份查找只使用经过校验的来源 ID 与规范化项目相对路径；两个来源的相同路径不得命中同一记录，Feature 路径也必须全局唯一。整仓切换时，若已存在其他来源的切换记录或现行规格维护权归属冲突则阻塞；`authority` 独立于各来源导入映射，切换前登记唯一外部维护源，切换后 owner 为 MAI 并保留接管来源。未知来源、缺字段或重复目标均阻塞。

对整仓切换，若已标记 MAI 接管且结果与归属记录一致，返回既有结果；源快照漂移作为诊断。再次查看不以原快照覆盖现行规格。初次切换只有全部关键条目可处理时才生成接管动作。受管内容、ROADMAP 与状态文件一起提交；历史索引条目以源归档路径或 MAI Feature 路径唯一定位。

### 批量选择与计划（示意）

```js
function planBatch(input, workspace, source) {
  const members = source.activeDirectChildren() // 排序后的目录名和类型，纳入快照
  const selected = input.active ? members.changeIds : validateDistinctIds(input.changes)
  if (!selected.length) return noChanges(members)
  const missing = selected.filter(id => !members.changeIds.includes(id))
  if (missing.length) return blockedWithIds('missing-or-inactive', missing)
  const allocation = workspace.snapshotAllocation()
  const items = [...selected].sort().map(id =>
    planOneImport(source.id, id, allocation, workspace))
  const findings = items.flatMap(item => item.findings)
  if (findings.some(finding => finding.blocking)) return blockedBatch(items, findings)
  return makeSinglePlan({ selection: selected, members, items,
    actions: combineFeatureWritesAndSingleRoadmapUpdate(items) })
}
```

所有选中项使用同一个来源/路径映射和编号预留视图；不可为每项独立加锁、独立提交或在失败后宣称批量完成。计划中记录每个 change 的来源快照、目标、映射和单一 ROADMAP 前后内容；目录成员、所选集合和排序规则纳入 revision。提交锁内重算并比较，按现有事务日志完成或整体回滚。批量预览展示人工核对 change 依赖和顺序的提示；保留原始资料，不解析自由文本或未知元数据、不推断依赖，也不自动迁入其他 change。

## 2. 项目内事务、并发与恢复

revision 对规范化项目根、命令、来源 ID、来源规则版本及选择、语义版本、稳定排序的输入快照、动作前后摘要及影响提交的发现取哈希。输入含目录成员、新路径不存在的快照、已选源文件、规划所用的 Profile/模板/布局、ROADMAP/编号、归属映射及归档依赖的任务/证据和现行规格。时间戳、临时目录、锁文件、事务 ID 不参与哈希。模板渲染不在预览阶段引入当前时间或随机内容。

以 `mai-specs/.feature-init.lock` 作为工作区锁的唯一门。取得锁后先写拥有者记录（随机令牌、本机进程身份），再重算计划。事务目录 `mai-specs/.mai-migration/pending/` 保存已准备日志、原/目标字节、路径和拟创建的父目录。日志及备份先于正式文件；临时发布文件、恢复材料目录仅拥有者可写。日志准备失败且未开始发布时，只清理确认是自身创建的临时材料。审查关键点：错误路径从不自动解锁一个尚未处理的持久事务。

```js
async function submit(root, request, expectedRevision) {
  const lock = await acquireWorkspaceLock(root)
  try {
    const p = await plan(root, request)
    assert(p.canApply && p.revision === expectedRevision)
    if (p.actions.length === 0) return unchanged(p)
    const journal = await persistPrepared(root, p, lock.token)
    try {
      for (const action of contentFirstThenIndexThenState(p.actions)) {
        // 严格复核父路径、目标类型和字节；新目标用独占发布。
        await publishIfBefore(root, action, journal)
      }
      // 复核只读输入、作用过的目标和未写入但参与判断的文件。
      await verifyFinalSnapshots(root, p)
      await persistCommitMarker(journal)
    } catch (error) {
      if (await hasValidCommitMarker(journal)) return appliedWithCleanupPending(p)
      return await rollbackOrKeepPending(root, journal, error)
    }
    return await finishCommittedOrReportCleanup(root, journal, p)
  } finally {
    // 有未清理事务则保留锁目录；其余仅释放自己的锁。
    await releaseIfNoPending(root, lock)
  }
}
```

- `publishIfBefore` 在发布前持久化该动作的开始记录，再次确认父目录和 `before`。以带令牌的临时文件写入普通文件，新目标用独占链接发布，已有目标确认前置快照后同目录 rename；删除只用于计划内确认的普通文件。开始记录使进程退出后能区分可能写入和从未触及的动作。临时文件使用不跟随链接的打开方式；根目录和每一级父目录用 lstat/realpath 复核。锁覆盖协作写入者；预览要求维护者在执行期间暂停编辑受影响文件。最终写前复核后、rename 前的非协作编辑可能被覆盖，首版不保证检测。Node 路径 API 也无法对绕过锁、恶意竞态替换父目录提供完整的句柄级隔离，首版适用于本机维护者控制的项目目录。
- 每个动作持久化 `started`、`published` 或 `failed`；同步发布明确失败（包括 EEXIST）时记录 failed，回滚绝不能触碰外部目标。发布前保留独占创建、已刷盘的 staging 文件并登记设备号与 inode；发布用硬链接创建新目标或将 staging 原子重命名覆盖旧目标，并保留 staging 的额外硬链接直到提交或回滚结束。成功时记录 published 和文件身份。中断后处于 started 的动作，只有目标仍与保留的 staging 确认同一设备号和 inode，且目标内容和类型匹配 after，才能认定本事务已发布；若 staging 不可用或身份不一致，保留现场并阻塞人工恢复。删除动作中断后目标缺失无法证明归属，保持阻塞并报告备份，不自动恢复或删除外部文件。已记录 published 仍须复核身份与 after；任何不符均保留并阻塞。
- 回滚按动作逆序处理：确认未发布且目标仍为 before 时无须改动；确认属于本事务的发布且目标匹配 after 时，才恢复备份的 before 或移除本事务创建的目标；其余保留现场、报告冲突和备份位置。创建过的目录只按逆序删除确定由本次创建且仍为空的目录。恢复本身同样用复核与独占发布。哈希比较不能区分外部重写的同字节内容；协作写入者必须用锁，手工处理前关闭其他写入。
- 提交标记为事务内最后一次持久写入，与事务 ID 和计划 revision 对应。读取状态时，若存在未提交的 pending 记录，接管/归档标记均不得视作有效；若已提交但未清理，原结果有效，后续写入仍先清理。日志和备份原子发布并刷新，提交前刷新已写文件与目录元数据；验证首版目标环境中的进程中断，不承诺跨文件系统或设备故障的事务原子性。
- `mai migrate recover` 无 `--dry-run` 或 `--revision` 时只显示用法并退出；`--dry-run` 只读检查，提交恢复先确认锁原拥有者已退出，再在原锁内取得恢复互斥门。恢复门记录拥有者；恢复进程再次中断时，后续操作只在能够核实其已退出后接手，否则报告人工处理，保留原锁与日志。复读日志和当前快照并比对恢复 revision。无正式日志且只有可识别的准备临时文件时，只清理准备现场（正式日志持久化前禁止发布）；有效提交标记存在时只清理；已有正式日志、无提交标记时走相同回滚。日志损坏、进程身份无法核实或目标不匹配时保持阻塞，输出逐路径核对和恢复指引。清理先隔离已处理的事务目录，再释放原锁；不在恢复途中删除或替换公共锁路径。没有拥有者记录的锁由维护者按旧流程核对处理，不推断其有迁移日志。

## 3. 差量对齐

迁移解析 change 里的 ADDED、MODIFIED、REMOVED、RENAMED，把需求、场景和 Purpose 写入该 Feature 的 `spec/PRD.md`。不新增 `mai feature archive`，不把差量原文写到 `spec/deltas/`，也不创建 `mai-specs/specs/` 或 `mai-specs/history/`。

## 5. OpenSpec 元数据输入边界（拟议）

核对依据：[上游 change metadata schema](https://github.com/Fission-AI/OpenSpec/blob/main/src/core/change-metadata/schema.ts) 及 [概念文档](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)。本次仅设计以下保守子集，具体上游版本须由实施时固定夹具和兼容矩阵验证。

- 缺少 `.openspec.yaml`：材料照原样导入；schema 来源和规格影响标为待核对。整仓接管若无法确定语义则阻塞，不默认为已批准的 `spec-driven`。元数据存在时，`schema` 必须为非空 `spec-driven`；其他值视为自定义 schema，单项/批量只保留并标待核对，整仓接管阻塞。
- 语义字段 `skip_specs`、`retire_capabilities` 缺省为 false，仅接受未加引号的小写 `true`/`false`。skip_specs=true 且实际存在差量时阻塞。retire_capabilities=true 时迁移保留能力文件，并在预览中警告。
- 非语义字段 `created`（YYYY-MM-DD）、`goal`、`affected_areas`、`initiative` 仅保留、展示，不据此自动判断验收或排序。`x-*` 与其他未知字段原样保留并显示字段名与未解释提示；若项目声明该字段改变规格或归档语义，须人工核对并在相关接管或归档时阻塞，不猜测字段的用途。
- 内置解析只接受 UTF-8 单个 YAML 文档、顶层映射、无重复键的子集：字符串（普通或单/双引号）、小写布尔值、字符串数组（行内或块序列）和 initiative 的一层 store/id 字符串映射；空白及行尾注释可用。禁用别名、锚点、标签、合并键、块字符串、复杂键、嵌套未知值和多文档，遇到不支持的语法、错误类型、重复键或不能区分注释/引号时报告路径与原因，单项/批量可原文保留并标不支持，整仓接管阻塞。不得正则忽略无法解析的部分后宣布安全。
- 固定样例一：`schema: spec-driven\ncreated: 2026-01-02\nskip_specs: false\n` 应通过语法检查；样例二追加 `x-team: platform` 时保留并提示未解释；样例三 `schema: custom-flow` 单导入保留而整仓接管阻塞；样例四重复 schema、锚点或 `retire_capabilities: true` 应分别报告解析阻塞或保留能力文件的警告。均验证迁移前后源文件字节一致，另覆盖缺失文件与非 UTF-8。
