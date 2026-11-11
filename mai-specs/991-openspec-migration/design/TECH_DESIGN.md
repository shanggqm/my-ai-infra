# 存量 OpenSpec 项目迁移技术方案

> Feature 991 · Profile：standard · 状态：待评审 · 代码基线：main / `9c436d2`  
> 模板：[项目标准技术方案](../../_templates/TECH_DESIGN.tmpl.md) · 需求与 AC：[PRD](../spec/PRD.md)

[返回需求简报](../BRIEF.md) · [预审报告](../review/design_review.md) · [供评审的代码设计](CODE_DESIGN.md)

## 1. 方案概述

CLI 在本地生成只读计划；维护者用计划的 revision 提交。单变更导入把提案、差量要求、设计和任务对齐到现有 Feature 布局，OpenSpec 继续负责现行规格和归档。整仓切换保留 OpenSpec 原目录，将现行规格、活动 Feature 和历史分别登记。首版只处理标准 Markdown 工作区，无需 OpenSpec CLI、运行时 npm 依赖、模型或后台服务。

当前 [CLI](../../../src/cli.mjs) 无迁移子命令；[项目装配](../../../src/project.mjs#L256) 只按需补齐工作区模板，保留现有普通文件；[Feature 初始化器](../../../assets/skills/my-create-feature/scripts/init-feature.mjs) 有编号、ROADMAP、模板校验和项目锁。设计复用这些规则，并单独实现迁移的计划和恢复流程，避免沿用安装器写个人库、按冲突策略跳过或替换资产的行为。

| 预审事项 | 本方案响应 |
|---|---|
| 缺少可评审的执行方案 | 定义 CLI、文件归属、切换和归档流程，并以代码骨架展开关键判断；任务表对应 AC-01 至 AC-08。 |
| 并发和中断 | 继续使用 `mai-specs/.feature-init.lock`；迁移、归档、初始化以及装配中的规格写入统一互斥。用项目内恢复记录分辨已提交、可回滚和需人工处理的状态。 |
| 在途差量已经同步 | 切换时逐字节迁入源现行规格；归档时对四类操作分别判断可应用、已满足或冲突。仅在有足够依据时跳过已满足的操作。AC-03 已由需求负责人确认，见 §4。 |
| 历史 change 用于后续开发 | 从工作区说明进入历史索引，可按能力路径或原 change ID 找到提案、设计和差量。后续 Feature 可以引用这些资料解释决策，以当前现行规格和本次有效需求判定行为。 |

## 2. 详细设计

### 2.1 CLI 契约与用户路径

迁移是项目级操作，使用 `mai migrate <来源>`。来源是必填的位置参数，用户和脚本都能直接看出从哪个工具迁移；首版只提供 `openspec`。中断恢复属于 `migrate recover`。本次不新增 Feature 归档命令。

| 操作 | 只读预览 | 提交 |
|---|---|---|
| 导入单个 OpenSpec change | `mai migrate openspec --change add-login --dry-run` | `mai migrate openspec --change add-login --revision HASH` |
| 导入指定的多个在途 change | `mai migrate openspec --changes add-login,add-search --dry-run` | `mai migrate openspec --changes add-login,add-search --revision HASH` |
| 导入全部在途 change | `mai migrate openspec --active --dry-run` | `mai migrate openspec --active --revision HASH` |
| 完整迁移 OpenSpec 工作区 | `mai migrate openspec --all --dry-run` | `mai migrate openspec --all --revision HASH` |
| 恢复中断的迁移 | `mai migrate recover --dry-run` | `mai migrate recover --revision HASH` |

示例中的 `add-login` 和 `999-login` 均是待操作项目中的实际标识示意。命令均可选 `--project PATH`，默认当前项目。缺少来源、未知来源或省略迁移范围时显示帮助和支持的来源，不自动探测或选择；`--change ID`、`--changes ID,ID`、`--active`、`--all` 必须且只能选一个。前三者只导入活动变更并保持 OpenSpec 维护源；`--all` 接管整个工作区。`--changes` 接收至少两个英文逗号分隔的非空 ID，拒绝重复或带路径的 ID，ID 只能是活动 change 直接子目录；名称本身含逗号时报告无法使用列表选择，可使用 `--active` 或逐项 `--change`。预览使用现有的 `--dry-run` 风格；交互和非交互提交均要求当前预览的 `--revision HASH`，与 `--dry-run` 互斥，缺少时只显示预览用法；恢复命令无参数也遵循此规则。预览结果提供可复制的完整提交命令。当前 CLI 的 `init/sync` 内部生成 revision，而个人记忆写入要求显式 revision；此处沿用后者以满足 PRD 的迁移确认要求。

`mai migrate --help` 列出来源及其支持的范围；`mai migrate openspec --help` 说明单 change 与整仓的差别、示例和原目录保留规则。未知来源、重复参数（不使用重复 `--change` 传递列表）、无效组合返回参数错误并给出帮助；阻塞、过期 revision 和待恢复返回退出码 2，参数或意外错误为 1，成功或无操作为 0。预览在 stdout 输出 JSON：来源、范围、维护源、文件动作、冲突、revision、可提交状态与下一步；诊断输出到 stderr，终端展示可读摘要，重定向时仅输出 JSON。若不可提交，不输出提交命令。帮助沿用 `--help`；不接受无关的 `--home`、`--yes`、`--conflict`。归档已由 OpenSpec 管理的 change 时给出 OpenSpec 交接提示；恢复仅处理已退出事务，无事务时说明无须恢复。

**批量语义**：`--changes` 选择指定集合，`--active` 选择预览时发现的全部活动 change；两个入口均为单次事务。按源 ID 排序生成确定性计划，已存在映射的项复用编号，新项依现有编号规则逐项在内存预留，最终一次更新 ROADMAP 和状态。预览逐项显示创建/复用、来源和目标、缺件、人工核对依赖的提示与阻塞，摘要显示总数及唯一 revision。首版不解析或推断跨 change 依赖和顺序；保留 proposal、design、tasks 和元数据原文，预览展示 PRD COPY-09，供维护者自行核对。任一项阻塞整批不可提交；执行中失败整体回滚，无法安全恢复时报告并保留恢复记录。显式列表和 `--active` 均将活动目录成员纳入 revision，成员变化要求重新预览，避免范围与展示失配；选中源、目标、索引或布局变化也拒绝旧 revision。`--active` 没有活动项时只报告无可迁移项。`--all` 和批量导入重用同一映射，后续整仓切换复用已导入 Feature 和进度。

**扩展边界**：CLI 以固定来源名分发到内置来源模块，首版只实现 `src/migrations/openspec.mjs`。该模块负责识别 OpenSpec 布局、列出支持的范围、读取源语义与生成候选计划；公共的目标路径校验、revision、锁、冲突检测、提交和恢复由 MAI 统一负责，来源模块不能直接写项目。revision 包含来源 ID、范围和来源解析规则版本，防止跨来源或范围误提交。映射标识以来源 ID 和源相对路径组成；同名 change 不会跨工具复用。多个来源要求写同一目标或争夺现行规格维护权时预览阻塞，由维护者选择；未知来源不得回退到 OpenSpec。

后续增加来源时，在有真实样本与需求后新增对应内置模块、注册帮助及兼容矩阵，分别定义该来源可迁移的对象、历史和规格语义，再复用公共计划与事务测试。当前不设计第三方插件、自动检测或假设不同工具拥有相同的 change/差量模型；新来源是否支持单项或整仓由其明确声明。本次也不承诺任何其他工具已经受支持。项目没有 MAI 工作区时，允许迁移创建最小规格目录与路线图；安装工作流由独立的 `mai init` 完成。

### 2.2 文件、身份与维护源

| 对象 | 路径和规则 |
|---|---|
| 现行规格 | `mai-specs/specs/<capability-path>/spec.md`，整仓切换从源现行规格按路径和字节复制；不扫描历史来反推现行状态。已有目标仅在同字节时复用，否则冲突。 |
| 活动 Feature | `mai-specs/NNN-slug/`。共用编号、Profile、BRIEF、ROADMAP 规则。新导入的活动 change 保持 `draft`，登记在 ROADMAP 规划中。单导入后若源仍在活动目录，整仓切换保留已有 ID 和 Phase。 |
| 在途材料 | 按 MAI 布局对齐，不把 OpenSpec 目录原样放入 Feature。`proposal.md` 和差量要求对齐为 `spec/PRD.md`，`design.md` 与 `tasks.md` 对齐为 `design/TECH_DESIGN.md`。`.openspec.yaml` 只参与迁移状态，不写入 Feature。其余附件进入 `context/` 并记入索引。任务勾选保留。后续阶段按 BRIEF 链接打开这些产物。 |
| 已归档 change | 每个 `openspec/changes/archive/<folder>/` 按在途材料的同一规则对齐为 Feature。BRIEF Phase 写 `done`，ROADMAP 行放在已完成。`mai-specs/history/openspec/<archive-folder>/` 与 `mai-specs/history/INDEX.md` 保留原文，供人工阅读。已导入后再出现在归档目录的 change 复用原 Feature，并把 Phase 与 ROADMAP 同步为 done。 |
| 切换与导入状态 | `mai-specs/.mai-migration/state.json` 保存版本、独立维护源、按来源 ID 和源路径分组的 Feature 映射，以及受管材料上次源和目标摘要。使用项目相对路径，可随仓库移动。和规格一起提交到版本库；临时日志、锁和恢复副本留在本地并排除出 Git。 |

先读取项目布局，缺省使用随包契约。保形目录与自定义登记路径重叠、命名在大小写或 Unicode 归一后冲突、或初始化模板与 `initialFiles` 不一致时在预览阻塞。Markdown 原文和二进制附件保留字节；同子树链接自然保留。指向子树之外的相对引用按来源映射生成索引提示，无法定位时列原文位置和失效路径；关键材料无法访问时阻塞。源本来缺少设计、任务或 PRD 时可保真导入为资料不全的草稿；缺少任务或有效需求时标明不可接续。原文的勾选、评审和测试材料保留，进入实施前要核对当前代码、前置条件与证据；没有可判定前置时先明确缺口。

切换前，单导入依靠相对源路径匹配，而不是按标题或 slug 猜测。上次源与目标摘要用于识别哪一侧改动：源未变则保留本地；仅源变化且目标未改，可在预览列明更新，已导入文件从源消失时保留并列人工处理；双方不同步修改时阻塞，维护者备份后把受管副本调成一致，再重新预览。若源已进入归档目录且 MAI 已有该 change 的 Feature，整仓切换复用该 Feature，把 BRIEF Phase 写成 done，并把 ROADMAP 行移到已完成。不另建第二个 Feature，不改写已对齐且未分叉的 PRD。整仓成功后禁止继续从 OpenSpec 增量导入；重复整仓操作返回原切换结果，源快照后续变化只提示漂移。状态文件损坏或与 Feature / ROADMAP 不一致时阻塞，不从 slug 重建身份。

### 2.3 历史接续

整仓切换把 `openspec/changes/archive/` 复制到 `mai-specs/history/openspec/`，并写入 `mai-specs/history/INDEX.md`，供人工阅读原文。每个已归档 change 同时按在途 change 的规则对齐为 Feature，并用 MAI 既有完成状态记录：BRIEF Phase 为 `done`，ROADMAP 行在已完成。差量只进入该 Feature 的 PRD，不回放进现行规格。MAI 不新增归档阶段，也不改 Skill。后续阶段仍按各 Feature 的 BRIEF 链接读取。

### 2.4 并发、发布与恢复

1. **只读计划**：盘点选中源、读写目标、目录成员和布局，计算 revision，记录阻塞。按规范化项目根定位；扫描及写入拒绝文件或父目录软链、特殊文件与路径越界。预览不创建锁、恢复文件或目录。
2. **提交**：取得工作区锁后重算计划，核对 revision 和门槛。首建工作区仅允许创建空的锁父目录，空根的创建不改变计划；若原无工作区且回滚后仍空，尝试删除该目录。新 Feature 初始化仍沿用原锁；CLI 和 Web 的资产装配写 `mai-specs/` 时也须用它，装配锁顺序固定为个人库锁 → 工作区锁，迁移不取个人库锁。预览显示受影响文件及 PRD COPY-08，要求维护者在迁移、归档或恢复执行期间暂停编辑这些文件。对不使用锁的编辑器，逐路径复核、独占发布新文件，已检测到的不匹配内容保留并报告；最终写前复核与已有文件替换之间存在无法可靠检测的并发窗口，首版接受此限制，不承诺此窗口内的外部写入被保留。
3. **写入与发布**：先备好恢复日志与原/新内容，再用同目录临时文件发布单文件；规格与 Feature 内容先写，索引和状态后写，完成校验后写事务完成标记。未完成记录存在时，参与写入的 MAI 命令阻塞，读取端只将状态视为待恢复；直接浏览文件可能看到中间内容。标记成功后即使清理失败，也只报告已提交、清理待恢复，不重复应用。
4. **中断处理**：普通异常在原锁内逆序恢复；对残留事务先检查拥有者已退出，再按显式 recovery revision 操作。恢复仅反转能确认仍属于本事务的内容；已被外部改动的文件保持原样并报告备份位置。原 OpenSpec 始终只读；恢复完成或确认提交后才解除写入阻塞。详见[代码设计](CODE_DESIGN.md)。

## 3. 风险与验证

| 风险 | 最小验证 |
|---|---|
| 写前已检测到外部编辑或 MAI 操作争用编号 | 在隔离项目并行运行初始化、迁移和装配规格写入，观察互斥及重新预览；分别替换源文件、目标索引、任务证据和现行规格，确认旧 revision 不提交；在写前复核前注入外部编辑并确认保留。最终复核与替换之间的外部编辑窗口由上述暂停编辑约束覆盖。 |
| 进程中断或磁盘错误造成部分切换 | 在已写规格、未写索引；已写状态、未写提交标记；已提交、未清理三个位置注入失败。比较回滚后的字节和目录；另测外部编辑、软链接替换与恢复重复执行。 |
| Markdown 语法误判或丢失未涉及内容 | 对照[上游规格约定](https://github.com/Fission-AI/OpenSpec/blob/main/openspec/specs/openspec-conventions/spec.md)和[差量应用源码](https://github.com/Fission-AI/OpenSpec/blob/main/src/core/specs-apply.ts)选样本。验证嵌套能力、围栏、四类差量、同一需求改名后修改、重放和已满足冲突。 |
| 迁了历史却找不到，或接续误用旧依据 | 用一组脱敏项目，从新 Feature 只给能力路径查到历史；从迁入活动 Feature 继续首项可执行任务，并验证历史差量、旧批准和旧证据未自动生效。需做真实宿主行为验证。 |

## 4. 兼容性与待确认

- 跨 change 的标准依赖字段尚无明确约定；[OpenSpec 依赖字段提案](https://github.com/Fission-AI/OpenSpec/issues/1915)尚未成为本方案支持的契约。首版不扫描自由文本推断依赖；未来上游形成稳定约定后按版本评估。
- 首版输入是标准 OpenSpec Markdown 布局和 `spec-driven` 语义；自定义 schema、非标准目录和影响归档语义的选项在受影响操作中显式阻塞。标准目录即使带有未识别附件也保留原文。具体兼容版本待用脱敏样本和固定的上游夹具确定；暂无真实仓库证据。
- **AC-03 已确认**：保留源现行规格中已同步结果，迁移不应用尚未生效的在途差量，也不重放历史差量；用户于 2026-11-10 确认。按 PRD 原编号验收，补充已同步 A 与未同步 B 的混合场景。
- 保持原 OpenSpec 文件与宿主配置；切换说明要求维护者将后续规格工作改用 MAI。旧 MAI 包的装配不持工作区锁，迁移与归档期间使用已升级的 CLI/Web 装配入口；旧 Feature 初始化脚本已经竞争同一个锁路径。旧包不会识别新的归档状态和恢复提示。
- 减法：保留一个本地状态文件、一个工作区锁和当前事务恢复目录。先不建设查询命令、索引服务、双向同步、通用迁移框架或自动证据推断；普通 Markdown 索引、已装配的工作流和人工复核足以覆盖首版目标。

## 5. 任务分解

以下是拟实施文件，新增路径在实际实现时创建。当前仅有设计文档。

| 任务 | 文件 / 变更 | 依赖 | 验证与 AC |
|---|---|---|---|
| T1 共享工作区规则 | 从 `assets/skills/my-create-feature/scripts/init-feature.mjs` 提取 `feature-workspace.mjs`：保留独立脚本可用性，供 CLI 和脚本复用编号、ROADMAP、模板与锁；`src/project.mjs` 接入规格写入锁。 | 无 | `test/feature-init.test.mjs` 回归、`test/existing-project.test.mjs` 或装配集成覆盖并发争用、旧索引和自定义布局；AC-03/04/08。 |
| T2 迁移计划与提交 | `src/cli.mjs` 分流；新增 `src/feature-migration.mjs`、`src/migrations/openspec.mjs`、`src/feature-transaction.mjs`，实现迁移扫描、单项/批量/整仓模式、映射、revision、工作区日志及恢复。 | T1 | 新增 `test/feature-migration.test.mjs` 和事务故障测试；覆盖参数互斥、恢复缺省用法、缺少提交 revision、不同来源相同路径、维护权冲突、空源、单导入、指定批量、全部活动项、整仓、重复、整批冲突、批量中途失败和过期预览；AC-01/02/03/04/08/09/10。 |
| T3 差量对齐 | 新增 `src/spec-delta.mjs`、`src/openspec-align.mjs`，把差量要求写入 `spec/PRD.md`。 | T1、T2 | `test/feature-migration.test.mjs` 覆盖四类差量解析、PRD 对齐和现行规格不被改写；AC-06/07。 |
| T4 接续和历史入口 | `assets/skills/my-create-feature/references/stage-contracts.md` 与实际读取需求、设计和任务的阶段 Skill 接入 BRIEF 链接；`templates/mai-specs/README.md`、`docs/usage.md`、`docs/troubleshooting.md` 提供入口与恢复步骤；`manifest.yml` 和分发资源按实际新增文件核对。 | T2、T3 | 实际宿主接续、按能力找历史、链接可达；AC-03/05。用 `test/workflow-evals.md` 登记场景，另行执行真实宿主验证。 |

代码交付执行 `npm run verify`；涉及分发资产与 CLI 的本次功能交付另执行 `npm run release:check`，装配锁影响共享 Web 写入入口时另跑浏览器回归。上述是实施后的验收要求，本阶段未运行迁移或归档。关键业务验证缺口是缺真实样本与宿主接续证据，以及回滚时外部编辑保留；由后续测试规划安排。
