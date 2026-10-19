# 技术债治理测试与验收

> [返回 BRIEF](../BRIEF.md) · [有效需求与 AC](../design/TECH_DESIGN.md#需求依据与验收) · Feature 994

本 Feature 无独立 PRD，预期以技术方案登记的 AC-01～15 及用户后续授权为依据。AC-14 的开发前暂停已有记录；扩充后的 AC-06 与新增 AC-15 要求比较方案并请用户选择，后续实施仍按已有授权。测试对象为本轮工作树；已有 998 的结果不能代替当前验证。

## 已有与新增工程覆盖

| 范围 / AC | 入口与证据要求 | 覆盖边界 |
|---|---|---|
| 资源与独立装配 / AC-12 | [debt-assets.test.mjs](../../../test/debt-assets.test.mjs)：单独选择新 Skill，核对实际文件、相对资源链接、四工具入口、移动与重复同步 | 验证装配可用，不证明宿主执行了分析 |
| 选择及用户材料保护 / AC-11～12 | 同一测试：旧固定选择不扩张；自定义报告模板和已有报告保留；Skill 模板 abort/merge/replace 及备份；同名个人 Skill 无损拒绝 | 同名报告、模板选择优先级与外部软链接写入另由 H-10 验证 |
| 默认发现与回归 / AC-12 | `test/{discovery,infra,flat-layout,single-source}.test.mjs`：数量取 catalog，显式检查新增条目；保留既有迁移、别名、冲突回归 | 项目声明 ready 与宿主发现分别报告 |
| 包内分发 / AC-12 | `npm run release:check`：实际 tarball 包含入口、分类、模板及评测资源；隔离安装仅该 Skill，移动后四入口仍能读取全部资源，sync/doctor 通过 | 不发布 npm，不使用真实个人库 |
| 工作台 / AC-12 | `npm run test:web`：新 Skill 在“编码辅助”中、默认选中、主流程快捷选择排除、内置只读、实际应用后附属模板可读 | 无新增 UI；复用现有响应式与权限回归 |
| 工程总体验证 | `npm run verify`，记录时间、当前代码基线、退出结果；包及浏览器单独记录 | 静态资源检查不证明内容判断质量 |

## 需要实际宿主验证的业务场景

具体输入、夹具与判据只维护在 [Skill 行为用例](../../../assets/skills/my-analyze-debt/evals/cases.md)；阶段编排补充见 [Prompt 行为评测](../../../test/prompt-evals.md#技术债治理feature-994)。以下保留追溯和执行边界。

| 用例 / AC | 操作与关键预期 | 必留证据 |
|---|---|---|
| H-01～02 / AC-01～06、13 | 无 Feature / PR 独立分析；从真实规则和调用链判断规则分叉，区分事实/推断/待核验；有限任务有保留行为、退出与回滚条件 | 原始输入、报告、证据位置、目录差异；未自动改代码或建 Feature |
| H-03～05 / AC-02～05、10 | 合理差异、唯一生成源、稳定大文件与可信测试作为反证；缺历史/Owner/运行环境时明确未知；测试期望循环时识别保护缺口 | 排除项及依据、未知项、实际检查与未运行声明 |
| H-06～08 / AC-07～10 | 当前安全风险与无关旧债分开；simple 文案保持简短，核心契约保留审查；规则冲突核对有效依据 | 评审归因、修复范围、阶段轨迹、当前规则与历史材料前后差异 |
| H-09 / AC-06、10～11 | 复查已有报告，保留 ID/批注；契约改变使旧证据待复查，未有当前证据不关闭 | 原报告、新报告差异及验证状态 |
| H-10 / AC-11、13 | 显式/项目/内置模板按顺序选择；坏覆盖、路径占位、同日重名、外部软链接或其他阶段产物冲突均保护现场 | 模板来源、输出路径、前后哈希与链接目标；不能以静态词匹配替代 |
| H-11～12 / AC-12～13 | 仅装新 Skill 可分析；既有阶段缺新 Skill仍正常；只分析/设计及材料中的后续建议不触发实施或虚构核验 | 实际安装选择、调用轨迹、输出与写入范围 |
| H-13 / AC-06、15 | 重点债务与旧模板均比较全局最优/MVP并等待选择；无发现不凑方案；用户选 B 后仅细化计划 | 两案实际动作、影响与余债/演进、推荐及选择题；旧模板/源码保持；真实用户选择来源及后续写入范围 |

每次执行使用可区分的临时项目和个人库；运行前复制原始夹具，报告写在指定隔离目录。至少一个支持宿主覆盖全组，其他宿主记录入口检查和三类代表行为的实际结果。用例结束仅清理本次临时环境；无条件项写受阻或未执行，不改变预期求通过。

## 当前执行记录

本节保留双方案追加前的完整实现验收；新增 H-13 与当前资源指纹单独见[方案选择增量验收](OPTIONS_REVIEW.md)，旧通过计数不代表新增行为通过。

2026-10-18，在仓库根目录、Node 当前环境，以 `b82c073` 加当前 998 / 994 工作树执行：

- `node --test test/debt-assets.test.mjs test/discovery.test.mjs test/flat-layout.test.mjs test/single-source.test.mjs test/infra.test.mjs`：首轮 54/56 通过；两项因其他任务正在写资产而触发预览 revision 拦截，现场符合并发保护契约。
- 资产稳定后重跑 `node --test test/debt-assets.test.mjs`：4/4 通过；`node --test --test-name-pattern='plan is read-only, initializes all adapters' test/infra.test.mjs`：1/1 通过，覆盖首轮失败项。
- 新测试与修改的 release / Web 脚本 `node --check` 通过，`git diff --check` 通过。

资产定稿后统一执行 `npm run release:check`（含完整 `verify`）：246/246 测试通过，无失败和跳过；实际 tarball 15 项新 Skill 资源、独立安装、四入口移动与重复同步通过。`MAI_WEB_ARTIFACT_DIR=dist/feature-994/web npm run test:web` 的 7 组检查通过，包括新增辅助分类、默认包含、主流程快捷选择排除、实际应用和四种视口回归。

行为评测发现的具体问题修正后，按最终文本重新执行 `npm run release:check`，仍为 246/246 测试、实际包 13 组验收通过。最终工程原始结果位于 `dist/feature-994/final-validation/release-check.log`、`release-report.json`；浏览器证据为 `dist/feature-994/web/report.json`。逐案行为判断、原始失败与修正、当前限制见[验收记录](ACCEPTANCE.md)及[证据指纹](EVIDENCE.json)，工程检查不替代模型行为证据。
