# Feature 994 技术方案评审

> 本记录保留当时的结论与证据范围；已重命名资产和评测的链接指向当前路径。

> 日期：2026-10-18 · [方案](../design/TECH_DESIGN.md) · [供评审附录](../design/CODE_DESIGN.md) · [BRIEF](../BRIEF.md)
> 执行方式：主 Agent 按 `assets/skills/my-review-design/SKILL.md` 单独进行方案复核，未委派独立评审者。

## 总体结论

**通过本轮方案复核，可供用户审阅。** 当前没有未关闭的 P0/P1 设计问题。用户明确要求开发前停下，本结论不代表用户批准、不推进开发，也不代表新 Skill 已实现或宿主行为通过。

方案把阶段增量约束与独立存量分析分开，复用现有 Markdown 资产、catalog、安装器及验证入口；未引入评分平台、数据库或运行时依赖。12 类债务均给出可观察线索、持续成本和反例，输出有范围、基线、证据状态、排序理由和有限任务，能支撑后续实现。

## 范围与证据

- 输入：[用户原文](../context/pasted-text.txt)、[请求与附图解读](../context/需求说明与附图解读.md)、技术方案及附录；外部研究数字与网站未重新核验，未用作方案成立依据。
- 基线：HEAD `b82c0733c1a67c618a2c7becd71f82fa6b5ea460`，分支 `feature/998-adaptive-sdd-workflows`，含既有未提交修改；只读核对当前分发源，未修改现有实现。
- 对照：[设计 Skill](../../../assets/skills/my-create-design/SKILL.md)、[方案评审 Skill](../../../assets/skills/my-review-design/SKILL.md)、[代码评审 Skill](../../../assets/skills/my-review-code/SKILL.md)、[编排 Prompt](../../../assets/skills/my-auto-design/SKILL.md)、[共享契约](../../../assets/skills/my-create-feature/references/stage-contracts.md)。
- 装配事实：[catalog 说明](../../../catalog/README.md)、[默认配置与 CORE 选择](../../../src/store.mjs)、[名称读取](../../../src/names.mjs)、[资源检查](../../../scripts/check-skill-resources.mjs)、[manifest](../../../manifest.yml)。新 Skill 可复用这些机制，拟新增文件尚不存在符合本轮授权边界。
- 未覆盖：实际新 Skill 判断效果、安装包和浏览器新条目行为、团队生产环境、外部研究有效性；相关验证安排在主方案 §4。

## 覆盖与可实施性

| 需求 / AC | 设计与任务 | 评审判断 |
|---|---|---|
| 独立分析、典型债务、证据与成本，AC-01～04 | §2.1～2.3，T-01、T-07，附录判断分支 | 范围、资料缺失与反例处理明确；不依赖 Feature 或其他 Skill |
| 排序与有限偿债，AC-05～06 | §2.3 与附录模板/示例，H-02～06、H-09 | 紧急缺陷与债务优先级分开；建议、接受和关闭证据有边界 |
| 各阶段约束，AC-07～10 | §2.4，T-02～04，H-05～09 | 现有阶段保留职责，无新增全量扫描门槛；必要 for review check 内容仍覆盖 |
| 报告、资源与兼容，AC-11～12 | §2.3、2.5、§3，T-05～07，H-10～11 | 模板和输出范围明确，catalog default 语义与实际源码一致 |
| 授权、来源和停在开发前，AC-13～14 | 范围、§2.2、§5，H-12 | 本轮只写 Feature 产物与索引；后续指令不能被解释为自动开发授权 |

## 复核发现与修正

### R-01 · P1 · 报告输出与自定义 layout 的碰撞边界（已修正）

- 位置：方案 §2.3“输出路径”与“已有同日目标”。
- 事实：现有 layout 可自定义 `code-review` 路径，分析报告拟复用该路径的父目录。初稿只说明无关文件不覆盖，没有明确 layout 已存在但缺少映射、或 code-review 本身叫 DEBT_ANALYSIS.md 的处理。
- 触发与影响：可能错误使用默认目录，或让独立债务报告与原阶段报告共用路径，破坏单产物职责与报告来源。
- 修正：有效 layout 缺映射报告问题；禁止占用其他登记阶段产物；scope 禁路径分隔符/`..`；已有报告按用途识别后增量更新或选择未占用后缀。
- 复核：正文已明确这些边界，H-10 覆盖实际产物与无损写入。状态为设计修正已核对，运行行为待实施验证。

## 已核实的关键取舍

- `default=false` 对应非主流程快捷选择；`src/store.mjs:13` 的 CORE 过滤与 `:17` 的默认全部安装相互独立。方案没有据此错误承诺新项目默认不安装新 Skill。
- 现有 `my-review-code` 已有固定基线和历史债务边界，本方案增补持续成本与归因内容，无需再创建重复评审步骤或统一严重性框架。
- 既有项目模板按安装器 preserve；关键行为须由 Skill 保证，两档模板只提供呈现提示。新模板放 Skill 内，符合前文确定的资产归属方向。
- 债务分类对独立 Skill 自包含；既有阶段不依赖新 Skill 的长参考文档。只有安装该 Skill 才能运行其完整分析，未安装时不伪造入口或隐式补装。
- 原研究顺序不是事故优先级；认知债、性能债和历史分支均有证据前提，合理重复、稳定待退役模块允许保持现状。

## 后续条件与限制

1. 等待用户审阅当前方案；本轮停在开发前，Phase 保持 draft。
2. 用户授权后按 T-01～08 实施，在实际开发基线上重新核对路径及 998/模板迁移的交叉修改。
3. 运行 verify、release:check、test:web，并执行真实宿主行为用例；未通过前不宣称债务能力已交付。
4. 本报告为同一主 Agent 的方案复核，独立人工或其他评审者仍可在本文件追加意见；保留现有记录。

## 本轮实际检查

| 检查 | 结果与边界 |
|---|---|
| 创建脚本完整参数 `--check`，通过后去掉 `--check` 执行 | 均退出 0；脚本分配 994，初始化 BRIEF、上下文和 ROADMAP，素材原件逐字节一致 |
| `npm run validate` | 退出 0；当前仍为 10 个内置 Skill，未提前创建新 Skill；资源检查不证明未来行为 |
| `validate-feature.mjs --feature mai-specs/994-technical-debt-governance --artifact design` | 退出 0，valid=true，无 issues/warnings；只证明产物路径合法 |
| 同上改为 `--artifact design-review` | 退出 0，valid=true，无 issues/warnings |
| 本 Feature Markdown 本地链接及锚点检查 | 6 个 Markdown、40 处本地引用均可达；代码块中的拟新增路径不作为已存在资源 |
| 编号与覆盖核对 | AC-01～14、TD-01～12、T-01～08、H-01～12 连续且无重复；逐组覆盖见前文，不等于行为通过 |
| `git diff --check` | 退出 0，无空白错误 |
| 与开始时工作区文件指纹比较 | 已有文件仅 ROADMAP 变化，新文件均在本 Feature 内；原有资产、源码、安装副本与其他 Feature 保持原内容 |

未执行新 Skill 的宿主行为、代码/浏览器/安装包回归或 Mermaid 实际渲染；本轮没有实现变更，不报告这些检查通过。个人记忆未加载，未因本轮功能需求创建偏好记录。设计与评审完成后按用户要求停止，待其审阅。
