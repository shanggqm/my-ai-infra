# 994: 技术债治理贯穿 SDD 与独立债务分析 Skill

| 项 | 值 |
|---|---|
| Phase | review |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | andy |
| 目标日期 | 待填 |
| 涉及子系统 | SDD Skills、Prompt、模板、资产登记与分发验收 |

## 一句话描述

在需求、设计、实现、评审与验收中约束技术债，新增 my-analyze-debt，按证据分析存量，比较全局最优与 MVP 方案并由用户选择下一步。

## 背景

多人协作与快速 AI Coding 使理解、修改、验证、协调成本累积；需要事前立约束、事中审增量、事后查存量，并将治理结果反馈到当前契约与验证。前一阶段已按要求交付方案并停在开发前，2026-10-18 用户授权完整实现。

## 关键决策

- 有效需求与 AC 统一维护在[技术方案“需求依据与验收”](design/TECH_DESIGN.md#需求依据与验收)，本轮不另建 PRD。
- 新 Skill 正式名称为 `my-analyze-debt`；附图中的 `my-analysis-debt` 为未实现时的示意，不增加兼容别名。
- 各阶段约束当前变更，独立 Skill 分析存量；以持续理解、修改、验证和协调成本及实际证据判断债务。
- 分类与报告模板随新 Skill 分发；既有阶段保留必要短约束，不强制全量分析，不硬依赖新 Skill。
- 2026-10-18 完成技术方案及主 Agent 方案复核；用户要求开发前停下，Phase 保持 draft，尚未实现新 Skill 或修改分发源。
- 2026-10-18 用户追加“直接完整实现吧”：进入 dev；Skill 保持精炼克制，入口写通用且有实质的原则与约束，具体线索、反例和行为补丁放按需参考中。
- 2026-10-18 T-01～06 已实现；246 项测试、实际安装包及浏览器回归通过。Codex 30 次行为运行为 29 通过、1 受阻；Claude 六次运行保留原失败与定向修正，最终仍有 P2 判断问题。宿主权限/环境限制与纯对话复验缺口见验收记录，Phase 保持 review。
- 2026-10-18 用户追加方案选择要求：有治理项时至少比较全局最优与最小改动、影响面小且易实现的 MVP 两案，给出推荐并让用户做选择题；本轮增量单独验证，保留前次证据。
- 本轮编排使用当前分发源 `assets/prompts/my-auto-design.md` 及同作用域 Skill；所指 `.agents/skills/my-auto-design/` 不存在，安装副本版本较旧。

## 上下文索引

- [素材索引](context/_INDEX.md)
- [用户技术债材料](context/pasted-text.txt)
- [请求与附图解读](context/需求说明与附图解读.md)
- [技术方案与实施任务](design/TECH_DESIGN.md)
- [供评审的 Skill 与报告骨架](design/CODE_DESIGN.md)
- [方案评审记录](review/design_review.md)
- [测试与验收计划](test/TEST_PLAN.md)
- [独立实现审查](review/code_review.md)
- [实现与验收记录](test/ACCEPTANCE.md)
- [逐案证据与资源指纹](test/EVIDENCE.json)
- [方案比较与用户选择增量验收](test/OPTIONS_REVIEW.md)
