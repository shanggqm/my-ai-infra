# Feature 998 代码评审

> 本记录保留当时的结论与证据范围；已重命名资产和评测的链接指向当前路径。

> 最新修复复核：2026-10-19 **CR-W-03 / CR-W-04 已关闭**，见文末 §9；完整宿主行为验收仍有待验项。§8 及更早结论保留其原始基线。

> 日期：2026-10-18 | 结论：有条件通过 | 范围：当前工作区实现、资源、测试及分发变更

## 1. 结论

**有条件通过。** 本次确认的两项 Warning 均已由主 Agent 修复，并经独立复查关闭；当前未发现未关闭的代码缺陷。原子 Skill、场景 Prompt、动态来源和模板、Profile 初始化与索引兼容的实现有相应静态依据。

成立条件：完成当前版本的仓库及安装包检查，并按测试计划补齐实际宿主行为证据。当前报告不代表 AC-01～20 全部验收通过，不据此推进 Feature done。模型是否实际遵守阶段边界、模板优先级、风险升级及中断恢复，须以对应运行轨迹和产物判定。

补充复查已关闭原方案 W-01：Codex 实际完成 simple 无 PRD 测试规划、standard 无 PRD 直接设计，真实来源和用户内容保持均符合要求。其他 AC / 宿主的验收条件保持，见 §7。

## 2. 比较基线与范围

- 按用户指定的项目安装版 `my-review-code` Skill 独立执行。只新增本报告，并在原方案评审末尾追加 W-01 资源复查；未修改源码、测试、规格或状态。
- base / HEAD 均为 `b82c0733c1a67c618a2c7becd71f82fa6b5ea460`。本次是基线提交与工作区比较，没有新增 head 提交；已检查 staged（为空）、unstaged 和 untracked，不以提交 diff 代替未跟踪文件读取。
- 输入：[PRD](../spec/PRD.md)、[技术方案](../design/TECH_DESIGN.md)、[测试计划](../test/TEST_PLAN.md)、[方案评审](design_review.md)以及本轮原子能力、模板、类型和索引决定。
- 范围包括：七个 SDD Skill、共享阶段契约和 Profile 注册表、三条开发 Prompt、两份 simple 模板及 standard 模板适配、Feature 初始化和布局测试、四工具装配 / 发现与分发检查、manifest 和相关说明。未跟踪的 Prompt、模板、共享资源已读取。
- 同时核对未改动的 `src/project.mjs` 完整 Skill 目录装配 / preserve 逻辑、`src/assets.mjs` Prompt 入口规则、路径校验脚本及初始化原有锁 / 回滚 / 并发保护。无数据库、Web 交互、生产权限实现或运行时依赖变更。
- 写入本报告前有 38 个 tracked 修改、8 个 untracked 文件。排除 `mai-specs/` 记录后，本次 37 个实现 / 资源 / 检查 / 说明文件的收尾聚合 SHA-256 为 `460ef4cafa1bb5ebeb33842c91e17f8a135960937e6306ebc27988012c1bc7db`。计算方式：相对路径排序，各行 `路径 + NUL + 文件 SHA-256 + LF`，对拼接结果计算 SHA-256；后续修改需按影响复查。

关键文件内容指纹：

| 文件 | SHA-256 |
|---|---|
| `assets/skills/my-create-feature/scripts/init-feature.mjs` | `4479a15727ed110bbc8a18a868e7e74ab7bb45743a05e4c21c75208d5ba9c0cb` |
| `assets/skills/my-create-feature/references/stage-contracts.md` | `ddc0b34d1f61c23a066e4a781448955bec9867d20db23088e304b9b96afe8b4c` |
| `assets/prompts/my-simple-feature.md` | `9e87dd66140c29b0bd4eb585c0592f8c16caa3e1ed776c1526948a7ff209e961` |
| `manifest.yml` | `aba0ed147cae017f6da1d43ad1d97e2fa16d1bf2db135d16cd564cd5bcff6cbf` |
| `scripts/validate.mjs` | `ccd9f3698a43c8278c86a6767fea4aa9e0239f08cae769e731930d70d78ed23e` |
| `test/feature-init.test.mjs` | `7ffb99a7b5a124d183bc3ae12f257f1837d075459577ef3760decb14762490c7` |

## 3. 发现及修复复查

### CR-W-01：新增资源登记在 publication 之后，导致 manifest 非法（已关闭）

- **严重性：Warning；原阻塞：交付阻塞。证据：事实及实际复现。** 首轮 `manifest.yml` 第 128～131 行在 `publication` 映射之后追加四个顶层列表项，四项不属于 `deliverables`，且标准 YAML 解析以 `Psych::SyntaxError` 退出 1。原检查脚本按字符串切块，未检查该错误。
- **触发与影响：** 使用 YAML 读取当前 manifest 立即失败；按 deliverables 区块消费的工具也无法取得这四项新增资源。这是本次资源登记新增的问题。
- **最小修复：** 四项移回 deliverables，检查脚本限制顶层资源列表所属区块，并从 deliverables 内检查登记。
- **当前位置与复查：** [manifest](../../../manifest.yml)第 112～115 行已正确归属；[校验脚本](../../../scripts/validate.mjs)第 20～24 行检查区块，其资源检查读取 deliverables。Ruby 实际解析成功，且确认 Profile 注册表位于 deliverables；新增 [分发质量测试](../../../test/release-quality.test.mjs)第 76 行起将 Prompt 登记移至末尾后要求验证失败，独立执行通过。

### CR-W-02：旧无 Profile 模板与合法默认值变化组合后真源不一致（已关闭）

- **严重性：Warning；原阻塞：该兼容组合的正确性。证据：事实及隔离复现。** 首轮初始化只凭 `selectedProfile === 'standard'` 放行没有 Profile 行的旧 BRIEF 模板。
- **触发：** 在隔离 Skill 副本将合法注册表 default 改为 simple，移除旧 BRIEF 模板的 Profile 行，再显式创建 standard Feature。原实现成功返回 standard，ROADMAP 写 standard，但 BRIEF 缺字段，按共享契约读取时实际采用 simple。此组合与现有“默认值来自注册表”测试的支持范围一致；随包 default=standard 时不会触发。
- **影响：** BRIEF 真源与返回值 / 索引展示不同，违背 AC-17～20 的一致性要求。
- **最小修复：** 旧 standard 模板仅在其缺省语义也等于所选值时兼容，否则写入前返回模板能力缺口。
- **当前位置与复查：** [初始化脚本](../../../assets/skills/my-create-feature/scripts/init-feature.mjs)第 67～74、142、152 行传递已加载 default 并比较；新增 [初始化测试](../../../test/feature-init.test.mjs)第 637 行起覆盖该组合的 check / create 两条路径，均退出 1 且不创建 mai-specs。独立执行该用例及原旧模板兼容用例均通过。

没有其他已确认缺陷。以上关闭状态只对应本次所列内容指纹；后续相关修改重新核对。

## 4. 验收覆盖与证据边界

“静态支持”表示指令 / 源码与规格相符；测试文件存在及已读断言不代表本轮已执行。除下一节明确列出的独立运行，完整自动化和实际宿主结果由主流程的验收记录承接。

| AC | 实现依据 | 测试 / 验证及当前判断 |
|---|---|---|
| AC-01 微小任务 | simple Prompt 的直接任务分支；实施 Skill 的非 Feature 输入 | H-01；静态支持，实际无新增 Feature 的轨迹待验收 |
| AC-02 充分输入直接设计 | simple Prompt、设计 Skill、共享契约“有效需求来源与 AC” | H-02；静态支持，完整交付行为待验收 |
| AC-03 高风险单点修复 | simple Prompt 的契约、前后评审及正反例分支 | H-03；静态支持，高风险行为待验收 |
| AC-04 仅探索授权 | 三 Prompt 与共享契约的当前授权范围 | H-04；静态支持，停止边界待验收 |
| AC-05 未知与分阶段 | Prompt 的探索、依赖切片及整体完成条件 | H-05；静态支持，阶段证据待验收 |
| AC-06 实施中升级 | simple Prompt 与共享契约的暂停、同 ID、旧证据复查 | H-06；静态支持，实际升级待验收 |
| AC-07 旧 Feature | registry default、既有文档增量维护、保留 Phase | 初始化旧命令用例与 H-07；旧模板定向测试通过，其余以最终记录为准 |
| AC-08 部分安装 / 定制 | 共享契约资源缺失、作用域和模板规则；既有装配 preserve | single-source 回归、H-08；装配测试已读，模型缺依赖行为待验收 |
| AC-09 原子边界 | 七 Skill 统一阶段契约；测试缺口回传；三个 Prompt 编排 | H-09；静态未见旧的直接跨阶段测试派发残留，调用轨迹待验收 |
| AC-10 失败不误报 | 共享契约、实施 / 评审 / 测试 Skill 与 Prompt 完成条件 | H-10；静态支持，失败场景待验收 |
| AC-11 复杂 simple | simple Prompt、simple 技术方案任务模板 | H-11；静态支持，分阶段与最终联调待验收 |
| AC-12 无 PRD 接续 | 七 Skill 的有效输入；测试 acceptance-cases 和 standard 模板修正 | W-01a/b 的 Codex 测试规划 / 直接设计行为已独立复核通过；H-12 其余阶段与宿主待验收 |
| AC-13 PRD + 设计 | simple Prompt 和两份独立简版模板 | H-13；静态支持，实际模板和独立产物待验收 |
| AC-14 模板适配 | 共享契约优先级、坏覆盖不绕过、旧产物增量维护 | W-01a/b 的旧模板来源字段和批注保持已实际核对；H-14 其余模板组合 / 宿主待验收 |
| AC-15 缺口回传 | 各阶段 Skill 返回缺口，Prompt 安排补充 / 修复 | H-15；静态支持，实际调度待验收 |
| AC-16 后补 PRD | 共享契约源迁移、PRD / 设计 Skill 的编号保留与引用切换 | H-16；静态支持，中断接续待验收 |
| AC-17 常量及错误 | init-feature.mjs 的注册表结构、值域、默认值与写入前检查 | feature-init 的非法值 / 损坏 / 默认值用例；CR-W-02 定向修复验证通过 |
| AC-18 稳定路径 | 原编号分配与 NNN-slug 保持；共享契约单产物覆盖规则 | feature-init / layout；目录和编号逻辑已读，模型维护 H-18 待验收 |
| AC-19 索引结构 | roadmapWithRow 按表头四 / 五列渲染，预检及锁内复核 | feature-init 的混合分区、CRLF、缺分区、歧义及原并发 / 回滚用例已读；H-19 待验收 |
| AC-20 真源恢复 | 共享契约“索引同步与状态”；三 Prompt 定点维护与中断报告 | H-20；源码初始化事务已核对，既有 Feature 两文件维护为模型流程，需实际中断证据 |

### 原方案 W-01

测试 `acceptance-cases.md`、standard 设计 / 测试模板以及共享契约和阶段 Skill 已同步有效需求来源表达。W-01a/b 的旧模板保持、真实来源填写、不生成 PRD 已经 Codex 实际执行及独立证据复核；[方案评审](design_review.md)§8 保存基线、轨迹、产物哈希与检查范围，W-01 已关闭。

## 5. 实际执行的验证

所有命令在仓库根执行；临时反例使用隔离副本并清理，没有写入真实用户配置。

| 检查 | 结果与能证明的范围 |
|---|---|
| 隔离注册表 default=simple + 旧无字段模板 + 显式 standard 探针 | 修复前复现 BRIEF / ROADMAP 语义不一致；据此回传 CR-W-02 |
| Ruby `YAML.load_file("manifest.yml")` | 修复前解析失败；修复后退出 0，并确认新 Profile 资源属于 deliverables |
| `node --test --test-name-pattern='legacy (BRIEF\|missing Profile)\|resource entries placed' test/feature-init.test.mjs test/release-quality.test.mjs` | 3 项通过、0 失败；覆盖两项修复及原旧模板兼容，不代表整套测试或宿主行为通过 |
| 相关 diff、未跟踪资源、代码入口、测试断言与真实行号 | 已静态核对；无未关闭代码缺陷 |

主 Agent 正在执行完整分发检查及 Codex 隔离行为评测，日志位于忽略目录 `dist/feature-998/`。本报告未将运行中任务记为通过；其他宿主尚无当前有效结果。完整 verify / release:check 和模型行为结果以最终验收记录为准，本 SubAgent 不重复执行全部检查。

已执行 `node .agents/skills/my-create-feature/scripts/validate-feature.mjs --feature mai-specs/998-adaptive-sdd-workflows --artifact code-review`，退出 0，`valid: true`，issues / warnings 均为空；本报告 10 处、追加复查后的方案评审 16 处本地链接均可达。未执行浏览器回归、真实宿主安装或发布。

## 6. 待完成事项

当前优先完成测试计划其余承诺的宿主行为及安装包验收，保存实际调用、产物、版本和命令结果，继续核对来源迁移与档位同步中断。缺少运行条件的宿主和场景保持待验，不能以单一宿主、文件装配或本报告替代全部承诺。

代码评审已完成本轮静态与缺陷复查。用户已授权连续推进，由主流程继续回收验收证据；本报告不追加审批或提交 / 发布动作。

## 7. W-01 行为及分发路径补充复查（2026-10-18）

独立读取 `dist/feature-998/codex/w01/` 和 `standard_new/` 的 input、events、fixture、result、final、diff 与真实产物，复查步骤和内容哈希见[方案评审 §8](design_review.md#8-w-01-宿主行为复查2026-10-18已关闭)。w01 只新增测试计划；standard_new 新增技术方案并向 BRIEF 追加阶段索引，原正文 / 批注 / Phase 保持。两者均未创建 PRD，未改源码、原测试、ROADMAP 或用户模板，使用真实 AC 来源且未越过阶段授权。相关资产与当前分发源内容一致。

以上关闭 W-01 的两项具体行为复查，不关闭其他 AC 或其他宿主验收。w01 按输入只做测试规划，orderCount 功能的运行结果并未在该案例验证；standard_new 的命令执行只包含只读探索、产物路径及差异检查，没有业务功能测试。

一并核对 [release-check.mjs](../../../scripts/release-check.mjs)第 178 行：适配入口与期望的 `.agents` 路径两侧均经 `fs.realpath` 再比较，消除 macOS `/var` 与 `/private/var` 别名差异，仍校验同一实际资源，不修改装配或资产行为。该脚本 SHA-256 为 `2281763728459cc7f367bf011c4ac3941b819042bc551e9c4aba694f3052b801`；补充复核时 37 文件聚合指纹仍为 §2 所列 `460ef4cafa1bb5ebeb33842c91e17f8a135960937e6306ebc27988012c1bc7db`。完整安装包检查结果由主流程验收记录承接。

补充后再次执行 design-review / code-review 路径校验，均退出 0、无 issues / warnings；代码报告 12 处、方案评审 26 处本地链接均可达。


## 8. 全部未提交变更复审（2026-10-19）

### 8.1 结论与基线

**需修改。** 新确认两项 Warning / P2：附录命名与合法自定义 layout 冲突，以及注释中的 Profile 示例被当作有效元数据。它们阻止本轮对应兼容承诺通过；默认模板和默认路径不受这两种触发条件影响。本轮未发现新增 Critical / P0 / P1。此前 CR-W-01、CR-W-02 的修正仍存在且相关回归通过。

本次请求为本地全部未提交变更，覆盖 Feature 998 与 994；994 的阶段约束、独立 Skill、方案比较与选择流程结论另见 [994 复审报告](../../994-technical-debt-governance/review/code_review.md)。只维护这两份评审报告，未修改实现、测试、规格、Phase、ROADMAP 或安装副本。

- HEAD / 比较基线：`b82c0733c1a67c618a2c7becd71f82fa6b5ea460`。工作区没有独立 head commit；merge-base 不适用于本次比较。
- 分别检查 `git diff --cached`（空）、`git diff`（44 个 tracked 文件）、`git ls-files --others --exclude-standard`（40 个 untracked 文件）。未跟踪的资源、模板、夹具和规格记录纳入读取。
- 写报告前 84 个文件聚合 SHA-256：`58f05138f95e11ad767179ecf3ea42f76f3bd78fa39a39249619dbee08e62b84`；排除 `mai-specs/` 后 59 个实现、资产、说明和验证文件聚合 SHA-256：`506a8291aec3aa9e266afa7864e3a766afce4fda0261d929de15c22c2282215c`。计算：路径排序，每项 `相对路径 + NUL + 文件 SHA-256 + LF`，再对拼接内容求 SHA-256。报告更新会改变前者，后者应保持。
- 对照本 Feature 的 BRIEF、PRD AC-01～21、TECH_DESIGN（含供评审代码增补）、设计检查、既有评审、TEST_PLAN / ACCEPTANCE / EVIDENCE；同时对照 994 无 PRD 的有效需求源和增量证据。
- 追踪初始化器、layout 校验器及既有装配/目录链接/登记调用边界；核对新增测试的断言与隔离范围。运行环境 Node `v24.12.0`、macOS，仓库根为 `/Users/guomeiqing/Documents/geektime-course/learner-kit/code/my-ai-infra`。

### 8.2 新发现

#### CR-W-03 / P2：附录固定 basename 与合法自定义产物冲突

- **位置：** [设计 Skill](../../../assets/skills/my-create-design/SKILL.md)第 69～70 行；同规则在 [simple 模板](../../../assets/skills/my-create-design/assets/templates/TECH_DESIGN.simple.tmpl.md)第 20 行和 [standard 模板](../../../templates/mai-specs/_templates/TECH_DESIGN.tmpl.md)第 63 行。
- **触发：** 需要拆出代码附录，而项目将 `design` 登记为 `notes/CODE_DESIGN.md`；或者将其他阶段（例如 `code-review`）登记为 `review/CODE_DESIGN.md`。两种 layout 都可被现有 `loadLayout` 接受。
- **事实与复现：** 隔离探针用当前初始化器分别创建两种 layout 的 simple Feature。第一种按指令计算的主文和附录路径完全相同，普通 design 路径校验仍返回 `valid: true`，不能检出主文/附录职责重叠。第二种主文仍为 `design/TECH_DESIGN.md`，按新规则创建 `design/CODE_DESIGN.md` 后，`validateFeature` 返回 `valid: false`，issue 为 `misplaced-artifact`，expected 为 `review/CODE_DESIGN.md`。
- **影响：** AC-21 所承诺的自定义路径、独立附录和双向链接无法同时成立。遵守其他保留规则的 Agent 会被迫停下处理命名冲突；机械执行则存在把主文当附录更新或生成自链接的风险。这里实际证明的是路径碰撞/校验失败，没有宣称真实宿主已覆盖用户文档。
- **最小修正：** `CODE_DESIGN.md` 作为默认候选；拆分前核对主文路径、layout 已登记 basename 和已有文件用途，避开占用后选择同目录未占用的名称。合法同用途附录继续增量维护；主文与附录链接按实际名称生成。不要只检查完整路径：validator 对已登记 basename 也有约束。
- **复验：** 在上述两个合法 layout、已有无关同名文件及已有同用途附录场景执行 large / 自定义路径宿主用例，断言原文件不变、附录独立、双向链接可达且 design 路径校验通过。
- **级别与阻塞：** Warning / P2，阻塞 AC-21 的这些兼容组合；默认 layout 不因此判失败。994 的债务报告输出已单独处理同类命名碰撞，该保护尚未覆盖本附录。

#### CR-W-04 / P2：注释中的 Profile 行可以通过模板能力校验

- **位置：** [初始化器](../../../assets/skills/my-create-feature/scripts/init-feature.mjs)第 69～74 行，调用在第 152 行；现有 Profile 模板回归位于 [feature-init.test.mjs](../../../test/feature-init.test.mjs)第 603 行起。
- **触发：** 用户定制的 BRIEF 模板移除了元数据表中的 Profile 行，但在 HTML 注释中保留一行历史示例 `| Profile | {{PROFILE}} |`，随后选择 `--profile simple`。
- **事实与复现：** `checkProfileTemplate` 对整个 Markdown 使用逐行正则，不区分有效元数据和注释。隔离 Skill 副本仅作上述模板改动，check 返回 `ready: true`，create 返回 `profile: simple` 并成功发布索引；去除 HTML 注释后的 BRIEF 没有任何 Profile 行，ROADMAP 则写 `simple`。该例使用当前默认注册表，无需修改 default 或源码。
- **影响：** 初始化器把不能在有效元数据中记录档位的模板判为可用。后续按“缺 Profile 用 default”解释时会得到 standard，与索引和返回值不一致；至少已经产生无法可靠解释的 BRIEF 真源。影响 AC-17～20 的模板能力和真源一致性，当前测试仅覆盖完全缺字段、显式矛盾值和重复行，未覆盖被注释的示例。
- **最小修正：** 只从实际元数据表识别 Profile，排除 HTML 注释与 fenced code 示例，并核对渲染后的有效字段。无法明确识别时在写入前报模板能力缺口，保留旧 standard 无字段的兼容条件。
- **复验：** 追加注释及代码块示例的 check/create 负例，要求失败前后项目快照一致；正例保留有效 Profile 行和其他历史示例，确保实际字段与返回值、索引一致。
- **级别与阻塞：** Warning / P2，阻塞该定制模板兼容组合；随包未修改模板正常。

两个探针都在 `os.tmpdir()` 创建副本，结束清理。可复现脚本保留于 `/tmp/mai-review-20261019-probes.mjs`；执行命令 `node /tmp/mai-review-20261019-probes.mjs`，工作目录为本仓库，退出 0。退出 0 表示探针运行完成，输出明确展示以上缺陷，不能记作功能通过。即使临时脚本失效，上述输入变体与结果足以重建案例。

### 8.3 当前验收对应关系

下表是本轮复审判断；历史模型运行不自动升级为本轮重新执行。

| AC | 当前实现与验证依据 | 本轮结论 / 限制 |
|---|---|---|
| 01、02、13 | simple Prompt 的微小任务、充分输入直接设计、先 PRD 两条分支；两档模板 | 静态一致，旧 Codex 行为见原验收记录；本轮未重跑模型 |
| 03、06 | Prompt / 共享契约的高风险门槛、暂停受影响实施及同 ID 接续 | 静态一致；未新增生产操作验证 |
| 04、05、11 | 探索授权边界、分阶段退出与最终集成要求 | 静态一致；原行为证据保留其范围 |
| 07、08、14 | 同作用域资源、模板优先级、旧文档保持、当前初始化/装配测试 | 自动回归通过；CR-W-04 揭示未覆盖的定制模板组合 |
| 09、12、15 | 七阶段共享契约、有效来源、只回传测试缺口、Prompt 编排 | 静态无新增跨阶段执行要求；模型遵循情况未全组复跑 |
| 10、16 | 失败不结项、后补 PRD 保留 AC ID、来源迁移和证据复核 | 静态支持；不把本轮工程测试当这些模型行为通过 |
| 17、18 | registry 加载、规范值、旧模板处理、共同编号池/稳定路径 | 现有自动回归通过；CR-W-04 的有效元数据识别需修正 |
| 19、20 | 四/五列行渲染、预检、锁/回滚；BRIEF 真源及定点同步规则 | 索引结构和并发回归通过；注释 Profile 组合仍能形成不一致 |
| 21 | 设计/评审 Skill、两档代码设计模板、prompt-evals 六类用例 | CR-W-03 未关闭；六类新增宿主用例明确待执行，旧 AC-01～20 证据不能覆盖 |

AC-21 的完整新增用例只登记在 [prompt-evals.md](../../../test/workflow-evals.md)第 66～76 行，当前 TEST_PLAN / ACCEPTANCE 主映射仍止于 AC-20。PRD 和设计检查已经如实声明待验，未发现伪造通过；后续应在 Feature 测试与验收索引接入该增补，补齐内联/拆分、自定义路径、无适用代码及评审正反例证据。994 的局部核心契约评测不能覆盖这六类组合。

### 8.4 本轮实际验证与未验证项

- `npm run verify`：仓库根执行，退出 0；build:skill、lint、validate 均通过，**246/246 测试通过，0 失败/跳过**，测试耗时约 88.8 秒。日志 `/tmp/mai-review-20261019-verify.log`。
- `npm run test:web`：仓库根执行，退出 0，**7 组通过**；包括新 Skill 辅助分组、默认包含/主流程排除、实际应用、冲突保护及四种视口。日志 `/tmp/mai-review-20261019-web.log`。
- `git diff --check`：退出 0；两项隔离探针完成，结果见 §8.2。
- 安装包检查：上述 verify 通过后，将当前 package.files、scripts 和校验元信息复制到 `/private/var/folders/91/4ctrssmn4l99fdzt3l62pjf80000gn/T/mai-review-release-ONC4Oy`，执行 `npm exec --offline -- node scripts/release-check.mjs`，退出 0，**13 组通过**。这是 release:check 的安装包阶段，未重复运行已经通过的 verify。105 个包条目，SHA-256 `c3b8889d945a2e67ebb28896b51d1777813a8af386e05f88452353ad3b6b5ad2`；日志 `/tmp/mai-review-20261019-release.log`，包及 release-report 在该临时副本的 dist 内，未发布。未设置可选 MAI_CODEX_BIN / MAI_CLAUDE_BIN，本轮不计入宿主发现验证。
- 收尾 `npm run validate`、`git diff --check` 均退出 0；两份评审报告共 33 处本地文件链接可达。与复审前快照逐文件比对，仅本报告和 994 代码评审报告变化。
- 按用户指定安装版流程调用 `.agents/skills/my-create-feature/scripts/validate-feature.mjs --feature <998 或 994> --artifact code-review`，两者均退出 1：旧安装布局仍登记 `review/acceptance.md`，因此将已有 `test/ACCEPTANCE.md` 视为 misplaced。随后使用当前分发源 `assets/skills/my-create-feature/scripts/validate-feature.mjs` 对同一两 Feature 校验，均退出 0、valid=true、无 issues/warnings。当前分发布局已无退休 acceptance artifact；此差异是本地安装副本较旧，不归为本次新增缺陷，不修改安装副本或搬移历史验收文件以消除告警。报告本身的 code-review 路径在两版本中一致。
- 本轮没有新启动 Codex / Claude / Cursor / Copilot 模型行为评测，也没有将旧行为结果标成当前资产全组通过。未修改真实个人配置、安装副本，未提交、推送或发布。

下一步优先修复 CR-W-03 / CR-W-04，补相应回归并复评，然后回收 AC-21 和既有未关闭行为项的当前证据。报告结论不推进 Feature 状态。

## 9. 两项兼容缺陷修复与复核（2026-10-19）

用户明确授权直接修复后，按[技术方案 §5.7](../design/TECH_DESIGN.md#57-代码复审修正2026-10-19cr-w-03--cr-w-04)完成实现、回归与主 Agent 复核。**CR-W-03 / CR-W-04 已关闭；本轮修复通过。** 本节是实现自检和证据复核，没有另行调用独立评审 Agent，也不代表 AC-21 全组或其他宿主完成验收。HEAD 未变，未提交、推送或发布，Phase 保持 review。

### 修复及复核依据

- **CR-W-03**：设计 Skill 与两档模板统一将 `CODE_DESIGN.md` 作为候选名，先避开主文、layout 登记 basename（忽略大小写）和无关占用；优先增量维护合法的已有附录，再按需选择安全后缀。实际链接依据最终名称生成。两个 Codex 实例实际读取新规则并生成产物，下表的路径、保持和链接检查均通过。
- **CR-W-04**：初始化器从包含 Phase 的实际两列元数据表识别 Profile，忽略 HTML 注释、反引号/波浪线围栏和缩进代码。字段须唯一且与所选值一致，渲染后再校验，失效时不发布索引。旧 standard 无字段且等于注册表默认值的兼容保持。额外核对标题中的行内代码注释符不会吞掉有效元数据。
- 新增三个行为回归覆盖负例、有效字段与示例共存/CRLF、旧模板以及渲染后失效。check/create 负例检查无新 Feature / 索引残留，正例核对 BRIEF、返回值与 ROADMAP。既有锁、并发、回滚回归仍通过。

### 当前执行证据

| 检查 | 实际结果与边界 |
|---|---|
| `npm run verify` | 退出 0；build:skill、lint、validate 及 **249/249 测试通过**，0 失败/跳过，测试耗时 77.022 秒 |
| 安装包阶段 | verify 通过后，在隔离源码副本执行 `npm exec --offline -- node scripts/release-check.mjs`，退出 0，**13 组通过**，105 个包条目；未发布 |
| Codex：主文同名 + 候选被无关文件占用 | 主文 `notes/CODE_DESIGN.md` 保留，生成 `notes/CODE_DESIGN-03.md`；`CODE_DESIGN-02.md` 无关内容及主文批注保留，退出 0，222.494 秒 |
| Codex：其他阶段登记小写 basename + 已有附录 | `review/code_design.md` 保留，增量维护 `notes/refund-code.md`，主文/附录批注保留，退出 0，217.922 秒 |
| 两组外部断言 | 每组只变主文、附录和 BRIEF；分别 41 个其余条目保持，Phase=draft；design 路径 valid=true，双向链接及全部本地链接分别 12 / 15 处可达 |

实际宿主为 `codex-cli 0.154.0-alpha.6.2`，使用宿主默认模型；本次 JSON 事件未提供可核验模型名，未另行猜测。命令采用 `exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox workspace-write`，禁用审批交互，在独立临时项目与个人库执行；没有业务服务调用或源码实现。两组只证明附录命名、复用和文件保护的指定组合，不将示意代码或其业务规则计为运行通过。

原始输入、事件、产物、前后摘要、判定脚本及 `judgments.json` 保存于忽略目录 `dist/feature-998/review-fixes-20261019/`；同目录 `verify.log`、`release.log`、`release-report.json` 保存工程检查证据。安装包在 `/var/folders/91/4ctrssmn4l99fdzt3l62pjf80000gn/T/mai-998-fix-release-amhpWR/dist/`，SHA-256 为 `6fa9e28215babb60bab58c3444142bc6157d379875fd83d5cf3b7bfbca04a0b9`。没有覆盖旧 dist 验收包。

实际宿主安装的三个相关资源与当前分发源逐字节一致：设计 Skill `bcfae2177fc7f915e3932cc6464482142290c9edc34e2e848514d47acfd1bfc9`，simple 模板 `a70d06420b25919a122bd64e725657f19568ddf2e2b383c0d4580c0f8ee7ab85`，standard 模板 `1f0e7ce6909fbe3ea7f4fc5b525d2f086b77ad6e2faf6f7b4927983dc630f7cd`。当前初始化器为 `1850253a8a57c78b653be0090afbb152b0b7a28e1c41720fc784d927f4f0d04b`，测试文件为 `158531dc8c7acac664aef6d83918e13dcec9ccf315c6fdfb6ee372f58a797a95`，对应最终 verify；更早验证日志不替代这次结果。

### 剩余边界

收尾 `npm run validate`、`git diff --check` 及当前分发源对 998 / 994 的 code-review 路径校验均通过，issues / warnings 为空；本轮六份 Feature 文档共 85 处本地文件链接可达。最终源码摘要保持，宿主实际安装的三个设计资源摘要与当前源一致。相对 §8 复审前快照，仅本轮修复涉及的 7 个资产/测试文件及 6 份规格/报告变化，没有改动其他既有工作区文件。

AC-21 其余内联/拆分、无适用代码和评审正反例，及其他宿主矩阵继续按[测试计划](../test/TEST_PLAN.md)待验。994 的 R-05 是既有宿主报告质量问题，本轮没有重新执行或关闭。没有 Web 行为变更，本次修复未重跑浏览器；§8 的 7 组通过仅保留为修复前证据。旧安装副本与当前分发布局的 validator 差异见 §8.4，未修改本仓库安装副本。
